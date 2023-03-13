
'use strict';
const { Contract } = require('fabric-contract-api');
const stringify = require('json-stringify-deterministic');
const sortKeysRecursive = require('sort-keys-recursive');

// Chaincode name: ChoreographyTask_0wbsshm
class Fragment extends Contract {

  static registryNameRef = 'registryName';
  static fragmentNameRef = 'fragmentName';

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
      throw new Error(`Key ${key} does not exist for fragment ChoreographyTask_0wbsshm`);
    }
    return JSON.parse(object);
  }

  static async getFragmentName(ctx) {
    return await Fragment.readJSONfromState(ctx, Fragment.fragmentNameRef);
  }

  static async getRegistryName(ctx) {
    return await Fragment.readJSONfromState(ctx, Fragment.registryNameRef);
  }

  static async stateExists(ctx, key) {
    const object = await ctx.stub.getState(key.toString());
    return !(!object || object.length === 0);
  }

  /* CLIENT FUNCTIONS */
  async Init(ctx, choreographyId, fragmentName, registryName) {
    if (await Fragment.stateExists(ctx, choreographyId)) {
      throw new Error(`Fragment is already initiated (choreographyId: ${choreographyId})`);
    }
    const sequenceFlowStates = {
      Flow_1h2srje: false,
    };
    await Fragment.writeJSONtoState(ctx, choreographyId, sequenceFlowStates);
    await Fragment.writeJSONtoState(ctx, Fragment.fragmentNameRef, fragmentName);
    await Fragment.writeJSONtoState(ctx, Fragment.registryNameRef, registryName);
  }

  async getState(ctx, choreographyId) {
    const sequenceFlowState = await Fragment.readJSONfromState(ctx, choreographyId);
    return {
      sequenceFlowState,
      taskEnablement: {
        ChoreographyTask_0wbsshm: (await Fragment.isChoreographyTask_0wbsshmEnabled(ctx, choreographyId)).enabled,
ChoreographyTask_00xs60f: (await Fragment.isChoreographyTask_00xs60fEnabled(ctx, choreographyId)).enabled
      }
    };
  }

  static async isActiveForInitiator(ctx, choreographyId, initiatorRole) {
    const registryReference = await Fragment.getRegistryName(ctx);
    const fragmentReference = await Fragment.getFragmentName(ctx);

    // Check if fragment is active
    const isActive = (await Fragment.invokeChaincode(ctx, registryReference, 'isFragmentActive', [choreographyId, fragmentReference])).isActive;
    if (!isActive) {
      throw new Error(`Fragment is not active (choreography ${choreographyId})`);
    }

    // Check initiator
    const mspID = await ctx.clientIdentity.getMSPID();
    const hasRole = (await Fragment.invokeChaincode(ctx, registryReference, 'isParticipantActive', [choreographyId, initiatorRole, mspID])).isActive;
    if (!hasRole) {
      throw new Error(`${mspID} is not assigned to role ${initiatorRole}`);
    }
  }

  
// Precondition for task: 'Accept order'
static async isChoreographyTask_0wbsshmEnabled(ctx, choreographyId) {
  try {
    // Check if fragment is active
    await Fragment.isActiveForInitiator(ctx, choreographyId, 'Shop');

    
    // No sequence flow preconditions

    
    // Check data flow preconditions
    const registryReference = await Fragment.getRegistryName(ctx);
    const requiredDataObjects = [
      JSON.parse('{\"name\":\"ORDER\",\"states\":[\"REQUESTED\"]}')
    ];
    for (const dataObject of requiredDataObjects) {
      const { contractName } = await Fragment.invokeChaincode(ctx, registryReference, 'getDataObjectContractName', [choreographyId, dataObject.name]);
      const { state } = await Fragment.invokeChaincode(ctx, contractName, 'get', [choreographyId]);
      if (state.toUpperCase() !== dataObject.states[0].toUpperCase()) {
        throw new Error(`Data object ${dataObject.name} is in wrong state ${state}. Required: ${dataObject.states[0]} (choreography ${choreographyId})`);
      }
    }
  } catch (error) {
    return { enabled: false, error };
  }
  return { enabled: true, error: '' };
}

// Task: 'Accept order'
async ChoreographyTask_0wbsshm(ctx, choreographyId) {
  const taskEnablement = await Fragment.isChoreographyTask_0wbsshmEnabled(ctx, choreographyId);
  if (!(taskEnablement.enabled)) {
    throw new Error(taskEnablement.error);
  }

  const registryReference = await Fragment.getRegistryName(ctx);
  const states = await Fragment.readJSONfromState(ctx, choreographyId);

  // Apply sequence flow changes
  const newStates = {...states};

  
  // No incoming sequence flows
  
  
  const outgoingSequenceFlows = ['Flow_1h2srje']
  outgoingSequenceFlows.forEach(sequenceFlow => {
    newStates[sequenceFlow] = true;
  });

  await Fragment.writeJSONtoState(ctx, choreographyId, newStates);

  // Apply data state changes
  
  const modifiedDataObjects = [
    JSON.parse('{\"name\":\"ORDER\",\"states\":[\"ACCEPTED\"]}')
  ];
  for (const dataObject of modifiedDataObjects) {
    const { contractName } = await Fragment.invokeChaincode(ctx, registryReference, 'getDataObjectContractName', [choreographyId, dataObject.name]);
    await Fragment.invokeChaincode(ctx, contractName, 'set', [choreographyId, dataObject.states[0]]);
  }
}

// Precondition for task: 'hand over parcel'
static async isChoreographyTask_00xs60fEnabled(ctx, choreographyId) {
  try {
    // Check if fragment is active
    await Fragment.isActiveForInitiator(ctx, choreographyId, 'Shop');

    
    // Check sequence flow preconditions
    const states = await Fragment.readJSONfromState(ctx, choreographyId);
    const incomingSequenceFlows = ['Flow_1h2srje'];
    incomingSequenceFlows.forEach(sequenceFlow => {
      if (!states[sequenceFlow]) {
        throw new Error(`Sequence flow preconditions are not given - ${sequenceFlow} is not enabled (choreography ${choreographyId})`);
      }
    })

    
    // Check data flow preconditions
    const registryReference = await Fragment.getRegistryName(ctx);
    const requiredDataObjects = [
      JSON.parse('{\"name\":\"ORDER\",\"states\":[\"ACCEPTED\"]}')
    ];
    for (const dataObject of requiredDataObjects) {
      const { contractName } = await Fragment.invokeChaincode(ctx, registryReference, 'getDataObjectContractName', [choreographyId, dataObject.name]);
      const { state } = await Fragment.invokeChaincode(ctx, contractName, 'get', [choreographyId]);
      if (state.toUpperCase() !== dataObject.states[0].toUpperCase()) {
        throw new Error(`Data object ${dataObject.name} is in wrong state ${state}. Required: ${dataObject.states[0]} (choreography ${choreographyId})`);
      }
    }
  } catch (error) {
    return { enabled: false, error };
  }
  return { enabled: true, error: '' };
}

// Task: 'hand over parcel'
async ChoreographyTask_00xs60f(ctx, choreographyId) {
  const taskEnablement = await Fragment.isChoreographyTask_00xs60fEnabled(ctx, choreographyId);
  if (!(taskEnablement.enabled)) {
    throw new Error(taskEnablement.error);
  }

  const registryReference = await Fragment.getRegistryName(ctx);
  const states = await Fragment.readJSONfromState(ctx, choreographyId);

  // Apply sequence flow changes
  const newStates = {...states};

  
  const incomingSequenceFlows = ['Flow_1h2srje'];
  incomingSequenceFlows.forEach(sequenceFlow => {
    newStates[sequenceFlow] = false;
  })
  
  
  // No outgoing sequence flows

  await Fragment.writeJSONtoState(ctx, choreographyId, newStates);

  // Apply data state changes
  
  const modifiedDataObjects = [
    JSON.parse('{\"name\":\"PARCEL\",\"states\":[\"SENT\"]}')
  ];
  for (const dataObject of modifiedDataObjects) {
    const { contractName } = await Fragment.invokeChaincode(ctx, registryReference, 'getDataObjectContractName', [choreographyId, dataObject.name]);
    await Fragment.invokeChaincode(ctx, contractName, 'set', [choreographyId, dataObject.states[0]]);
  }
}
}

module.exports = Fragment;  
 