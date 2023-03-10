/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const stateObserver = require('./lib/state_observer');

module.exports.StateObserver = stateObserver;
module.exports.contracts = [stateObserver];
