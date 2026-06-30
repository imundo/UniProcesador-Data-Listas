import { Module } from 'module';
const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
    if (path === 'next/server') {
        return { NextResponse: { json: (data) => data } };
    }
    return originalRequire.apply(this, arguments);
};

import { syncRedAyuda } from './src/lib/redAyudaSync.js';
async function test() {
    console.log("Starting sync...");
    const res = await syncRedAyuda();
    console.log("Sync Result:", res);
}
test();
