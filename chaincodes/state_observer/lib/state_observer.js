
'use strict';
const { Contract } = require('fabric-contract-api');

class StateObserver extends Contract {

  /* HELPER FUNCTION */
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
  
  /* CLIENT FUNCTION */
  async getInstanceState(ctx, choreographyId, registryName) {
    const choreographyConfig =  await StateObserver.invokeChaincode(ctx, registryName, 'getConfig', [choreographyId]);

    const fragmentStates = {};
    for (const fragmentContractName of choreographyConfig.fragmentReferences) {
      const fragmentState = await StateObserver.invokeChaincode(ctx, fragmentContractName, 'getState', [choreographyId]);
      fragmentStates[fragmentContractName] = fragmentState;
    }

    const dataObjectNames = Object.keys(choreographyConfig.dataObjectReferences);
    const dataObjectStates = {};
    for (const dataObjectName of dataObjectNames) {
      const dataObjectContractName = choreographyConfig.dataObjectReferences[dataObjectName];
      const dataObjectState = await StateObserver.invokeChaincode(ctx, dataObjectContractName, 'get', [choreographyId]);
      Object.assign(dataObjectState, {contractName: dataObjectContractName});
      dataObjectStates[dataObjectName] = dataObjectState;
    }

    return {
      participants: choreographyConfig.participantMapping,
      fragments: fragmentStates,
      dataObjects: dataObjectStates,
    }
  }
}

module.exports = StateObserver;  
