/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const choreographyRegistry = require('./lib/choreographyRegistry');

module.exports.ChoreographyRegistry = choreographyRegistry;
module.exports.contracts = [choreographyRegistry];
