
'use strict';

const { Contract } = require('fabric-contract-api');
const stringify = require('json-stringify-deterministic');
const sortKeysRecursive = require('sort-keys-recursive');

// Data Object: PARCEL
class DataObject extends Contract {

  static states = ['INIT', 'SENT'];

  static async writeJSONtoState(ctx, key, json) {
    await ctx.stub.putState(key.toString(), Buffer.from(stringify(sortKeysRecursive(json))));
  }

  static async readJSONfromState(ctx, key) {
    const object = await ctx.stub.getState(key.toString());
    if (!object || object.length === 0) {
      throw new Error(`Key ${key} does not exist for PARCEL`);
    }
    return JSON.parse(object);
  }

  static async stateExists(ctx, key) {
    const object = await ctx.stub.getState(key.toString());
    return !(!object || object.length === 0);
  }

  async Init(ctx, choreographyId) {
    const object = { state: 'INIT' };
    await DataObject.writeJSONtoState(ctx, choreographyId, object);
  }

  async set(ctx, choreographyId, newState) {
    if (!DataObject.states.includes(newState)) {
      throw new Error(`Cannot set state of PARCEL to ${newState} (choreography ${choreographyId})`);
    }
    if (!DataObject.stateExists(ctx, choreographyId)) {
      throw new Error(`Cannot set state of PARCEL as it does not exist (choreography ${choreographyId})`);
    }
    const object = { state: newState.toString().toUpperCase() }
    await DataObject.writeJSONtoState(ctx, choreographyId, object);
  }

  async get(ctx, instanceId) {
    const object = await DataObject.readJSONfromState(ctx, instanceId);
    return object;
  }
}

module.exports = DataObject;
