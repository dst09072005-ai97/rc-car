const fs = require('fs');

function inspectGlbWithTransforms(filePath) {
    const buf = fs.readFileSync(filePath);
    const magic = buf.readUInt32LE(0);
    const version = buf.readUInt32LE(4);
    const totalLength = buf.readUInt32LE(8);
    
    if (magic !== 0x46546C67) {
        throw new Error('Not a valid GLB file');
    }
    
    const jsonChunkLength = buf.readUInt32LE(12);
    const jsonStr = buf.toString('utf8', 20, 20 + jsonChunkLength);
    const gltf = JSON.parse(jsonStr);
    
    console.log(`\n======================================================`);
    console.log(`INSPECTING WITH WORLD TRANSFORMS: ${filePath}`);
    
    let worldMin = [Infinity, Infinity, Infinity];
    let worldMax = [-Infinity, -Infinity, -Infinity];
    
    const nodes = gltf.nodes || [];
    const meshes = gltf.meshes || [];
    const accessors = gltf.accessors || [];
    
    nodes.forEach(node => {
        if (node.mesh !== undefined) {
            const mesh = meshes[node.mesh];
            const trans = node.translation || [0, 0, 0];
            const scale = node.scale || [1, 1, 1];
            
            mesh.primitives.forEach(prim => {
                if (prim.attributes && prim.attributes.POSITION !== undefined) {
                    const acc = accessors[prim.attributes.POSITION];
                    if (acc && acc.min && acc.max) {
                        for (let i = 0; i < 3; i++) {
                            const pMin = acc.min[i] * scale[i] + trans[i];
                            const pMax = acc.max[i] * scale[i] + trans[i];
                            if (pMin < worldMin[i]) worldMin[i] = pMin;
                            if (pMax > worldMax[i]) worldMax[i] = pMax;
                        }
                    }
                }
            });
        }
    });
    
    const worldSize = [
        worldMax[0] - worldMin[0],
        worldMax[1] - worldMin[1],
        worldMax[2] - worldMin[2]
    ];
    
    console.log(`World Bounds Min: [${worldMin.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`World Bounds Max: [${worldMax.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`World Dimensions (X, Y, Z in GLTF space): [${worldSize.map(v => v.toFixed(3)).join(', ')}]`);
    return { worldMin, worldMax, worldSize, gltf };
}

const calib = inspectGlbWithTransforms('D:/XE_RC_FPV_V10/controller_godot/models/calibration_gate.glb');
const city = inspectGlbWithTransforms('D:/XE_RC_FPV_V10/controller_godot/models/graybox_city_block.glb');

console.log("\n======================================================");
console.log("FINAL WORLD COORDINATE TEST RESULTS:");
console.log("1. Calibration Gate Height (GLTF Y-up): " + calib.worldSize[1].toFixed(2) + "m (Expected ~2.45m) -> " + (Math.abs(calib.worldSize[1] - 2.45) < 0.1 ? "PASS" : "FAIL"));
console.log("2. Calibration Gate Width (GLTF X): " + calib.worldSize[0].toFixed(2) + "m (Expected ~2.40m) -> " + (Math.abs(calib.worldSize[0] - 2.40) < 0.1 ? "PASS" : "FAIL"));
console.log("3. City Block Roadway Length X: " + city.worldSize[0].toFixed(2) + "m (Expected ~32.0m) -> " + (Math.abs(city.worldSize[0] - 32.0) < 0.5 ? "PASS" : "FAIL"));
console.log("4. City Block Building Max Height Y: " + city.worldSize[1].toFixed(2) + "m (Expected ~11.65m) -> " + (Math.abs(city.worldSize[1] - 11.65) < 0.5 ? "PASS" : "FAIL"));
console.log("5. City Block Total Depth Z: " + city.worldSize[2].toFixed(2) + "m (Expected ~30.0m) -> " + (Math.abs(city.worldSize[2] - 30.0) < 1.0 ? "PASS" : "FAIL"));
console.log("======================================================");
