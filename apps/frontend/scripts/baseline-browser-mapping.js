#!/usr/bin/env node

import { getCompatibleVersions } from 'baseline-browser-mapping';

const versions = getCompatibleVersions();
console.log(JSON.stringify(versions, null, 2));
