#!/usr/bin/env node

const { getCompatibleVersions } = require("baseline-browser-mapping");

const versions = getCompatibleVersions();
console.log(JSON.stringify(versions, null, 2));
