
'use strict';
const { Contract } = require('fabric-contract-api');
const stringify = require('json-stringify-deterministic');
const sortKeysRecursive = require('sort-keys-recursive');

// Registry name: Demonstration
class ChoreographyRegistry extends Contract {

  static instanceCounterRef = 'instanceCounter';
  static registryNameRef = 'registryName';

  /* HELPER FUNCTIONS */
  static async invokeChaincode(ctx, contractName, functionName, parameters = []) {
    const stringParameters = parameters.map(parameter => parameter.toString());
    let response = undefined;
    try {
      response = await ctx.stub.invokeChaincode(contractName, [functionName, ...stringParameters], ctx.stub.getChannelID());
      if (!response || response.status !== 200) {
        throw new Error('Could not receive a valid response');
      }
    } catch (error) {
      throw new Error(`Error occurred invoking function '${functionName}' on chaincode '${contractName}' with parameters [${stringParameters.join(', ')}]:
${error}`);
    }

    try {
      return JSON.parse(response.payload);
    } catch (error) {
      return null;
    }
  }

  static async writeJSONtoState(ctx, key, json) {
    await ctx.stub.putState(key.toString(), Buffer.from(stringify(sortKeysRecursive(json))));
  }

  static async readJSONfromState(ctx, key) {
    const object = await ctx.stub.getState(key.toString());
    if (!object || object.length === 0) {
      throw new Error(`Key ${key} does not exist for choreography registry Demonstration`);
    }
    return JSON.parse(object);
  }

  static async getRegistryName(ctx) {
    return await ChoreographyRegistry.readJSONfromState(ctx, ChoreographyRegistry.registryNameRef);
  }

  static async stateExists(ctx, key) {
    const object = await ctx.stub.getState(key.toString());
    return !(!object || object.length === 0);
  }

  /* CLIENT FUNCTIONS */
  async Init(ctx, registryName) {
    if (await ChoreographyRegistry.stateExists(ctx, ChoreographyRegistry.instanceCounterRef)) {
      throw new Error('Registry is already initiated');
    }
    const instanceCounter = {
      instanceCount: 0,
    };
    const registryNameRef = {
      registryName,
    }
    await ChoreographyRegistry.writeJSONtoState(ctx, ChoreographyRegistry.instanceCounterRef, instanceCounter);
    await ChoreographyRegistry.writeJSONtoState(ctx, ChoreographyRegistry.registryNameRef, registryNameRef);
  }

  async getConfig(ctx, choreographyId) {
    return await ChoreographyRegistry.readJSONfromState(ctx, choreographyId);
  }

  async createChoreographyInstance(ctx, fragmentReferences, participantMapping, dataObjectReferences) {
    const { instanceCount } = await ChoreographyRegistry.readJSONfromState(ctx, ChoreographyRegistry.instanceCounterRef);
    const choreographyId = (Number(instanceCount) + 1).toString();
    if (await ChoreographyRegistry.stateExists(ctx, choreographyId)) {
      throw new Error(`Tried to create a choreography instance that already exists (choreography ${choreographyId})`);
    }
    await ChoreographyRegistry.writeJSONtoState(ctx, ChoreographyRegistry.instanceCounterRef, { instanceCount: choreographyId });
    const choreographyConfig = { 
      fragmentReferences: JSON.parse(fragmentReferences),
      participantMapping: JSON.parse(participantMapping),
      dataObjectReferences: JSON.parse(dataObjectReferences),
    };
    await ChoreographyRegistry.writeJSONtoState(ctx, choreographyId, choreographyConfig);

    const { registryName } = await ChoreographyRegistry.getRegistryName(ctx);

    // Init fragments
    for (const fragmentContractName of choreographyConfig.fragmentReferences) {
      await ChoreographyRegistry.invokeChaincode(ctx, fragmentContractName, 'Init', [choreographyId, fragmentContractName, registryName]);
    }

    // Create data objects
    for (const dataObjectContractName of Object.values(choreographyConfig.dataObjectReferences)) {
      await ChoreographyRegistry.invokeChaincode(ctx, dataObjectContractName, 'Init', [choreographyId]);
    }

    return { choreographyId };
  }

  async isFragmentActive(ctx, choreographyId, fragmentName) {
    if (!(await ChoreographyRegistry.stateExists(ctx, choreographyId))) {
      throw new Error(`Choreography instance does not exist (choreography ${choreographyId})`);
    }
    const choreographyInstance = await ChoreographyRegistry.readJSONfromState(ctx, choreographyId);
    return { isActive: choreographyInstance.fragmentReferences.includes(fragmentName.toString()) };
  }

  async isParticipantActive(ctx, choreographyId, role, mspId) {
    if (!(await ChoreographyRegistry.stateExists(ctx, choreographyId))) {
      throw new Error(`Choreography instance does not exist (choreography ${choreographyId})`);
    }
    const choreographyInstance = await ChoreographyRegistry.readJSONfromState(ctx, choreographyId);
    return { isActive: choreographyInstance.participantMapping[role] === mspId.toString() };
  }

  async getDataObjectContractName(ctx, choreographyId, dataObjectName) {
    if (!(await ChoreographyRegistry.stateExists(ctx, choreographyId))) {
      throw new Error(`Choreography instance does not exist (choreography ${choreographyId})`);
    }
    const choreographyInstance = await ChoreographyRegistry.readJSONfromState(ctx, choreographyId);
    return { contractName: choreographyInstance.dataObjectReferences[dataObjectName.toUpperCase()] };
  }
  
  async getInstanceCount(ctx) {
    return await ChoreographyRegistry.readJSONfromState(ctx, ChoreographyRegistry.instanceCounterRef);
  }
}

module.exports = ChoreographyRegistry;  
