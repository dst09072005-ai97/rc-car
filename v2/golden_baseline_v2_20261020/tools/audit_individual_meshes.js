const fs = require('fs');

function inspectIndividualMeshes(filePath) {
    const buf = fs.readFileSync(filePath);
    const jsonChunkLength = buf.readUInt32LE(12);
    const jsonStr = buf.toString('utf8', 20, 20 + jsonChunkLength);
    const gltf = JSON.parse(jsonStr);
    
    console.log(`\n==================================================================`);
    console.log(`INDIVIDUAL MESH BOUNDING BOX AUDIT: ${filePath}`);
    console.log(`==================================================================`);
    
    const nodes = gltf.nodes || [];
    const meshes = gltf.meshes || [];
    const accessors = gltf.accessors || [];
    
    const results = [];
    
    nodes.forEach((node, nodeIdx) => {
        if (node.mesh !== undefined) {
            const mesh = meshes[node.mesh];
            const trans = node.translation || [0, 0, 0];
            const scale = node.scale || [1, 1, 1];
            
            let objMin = [Infinity, Infinity, Infinity];
            let objMax = [-Infinity, -Infinity, -Infinity];
            
            mesh.primitives.forEach(prim => {
                if (prim.attributes && prim.attributes.POSITION !== undefined) {
                    const acc = accessors[prim.attributes.POSITION];
                    if (acc && acc.min && acc.max) {
                        for (let i = 0; i < 3; i++) {
                            const pMin = acc.min[i] * scale[i] + trans[i];
                            const pMax = acc.max[i] * scale[i] + trans[i];
                            if (pMin < objMin[i]) objMin[i] = pMin;
                            if (pMax > objMax[i]) objMax[i] = pMax;
                        }
                    }
                }
            });
            
            const size = [
                objMax[0] - objMin[0],
                objMax[1] - objMin[1],
                objMax[2] - objMin[2]
            ];
            
            results.push({
                name: node.name || `Node_${nodeIdx}`,
                min: objMin,
                max: objMax,
                size: size,
                topY: objMax[1], // In GLTF Y-up, Y is vertical height
                bottomY: objMin[1]
            });
        }
    });
    
    // Sort by name
    results.sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`Total Objects with Mesh: ${results.length}\n`);
    console.log(`Name | Min [X, Y(Up), Z] | Max [X, Y(Up), Z] | Size [W, H, D] | Ground Clear`);
    console.log(`--------------------------------------------------------------------------------`);
    
    results.forEach(r => {
        const minStr = `[${r.min.map(v => v.toFixed(2)).join(', ')}]`;
        const maxStr = `[${r.max.map(v => v.toFixed(2)).join(', ')}]`;
        const sizeStr = `[${r.size.map(v => v.toFixed(2)).join(', ')}]`;
        console.log(`${r.name.padEnd(25)} | Min: ${minStr.padEnd(24)} | Max: ${maxStr.padEnd(24)} | Size: ${sizeStr.padEnd(20)} | Bottom Y: ${r.bottomY.toFixed(2)}m, Top Y: ${r.topY.toFixed(2)}m`);
    });
    
    // Specifically filter buildings to analyze height discrepancy
    console.log(`\n--- BUILDINGS HEIGHT AUDIT & DISCREPANCY ANALYSIS ---`);
    const buildings = results.filter(r => r.name.includes('Cafe') || r.name.includes('Shophouse') || r.name.includes('Building'));
    buildings.forEach(b => {
        console.log(`* ${b.name}: Bottom Y = ${b.bottomY.toFixed(2)}m, Top Y = ${b.topY.toFixed(2)}m -> Net Height = ${b.size[1].toFixed(2)}m`);
    });
}

inspectIndividualMeshes('D:/XE_RC_FPV_V10/controller_godot/models/graybox_city_block.glb');
