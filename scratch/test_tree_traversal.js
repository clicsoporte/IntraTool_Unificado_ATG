const { permissionTree, checkPermissionInTree } = require('./src/modules/core/lib/permissions');

console.log("=== TESTING NEW PERMISSION TREE TRAVERSALS ===");

function test(userPerms, reqPerm, expected) {
    const result = checkPermissionInTree(userPerms, reqPerm);
    console.log(`User Perms: [${userPerms.join(', ')}] -> Required: ${reqPerm} -> Has: ${result} (Expected: ${expected})`);
    if (result !== expected) {
        console.error(`❌ FAILED: ${reqPerm} expected ${expected} but got ${result}`);
        process.exit(1);
    } else {
        console.log(`✅ PASSED`);
    }
}

// 1. operations:access alone should NOT grant deliveries:collect
test(['operations:access'], 'deliveries:collect', false);

// 2. deliveries:collect should grant operations:access
test(['deliveries:collect'], 'operations:access', true);

// 3. dashboard:access alone should NOT grant admin:access
test(['dashboard:access'], 'admin:access', false);

// 4. admin:access should grant dashboard:access and deliveries:admin
test(['admin:access'], 'dashboard:access', true);
test(['admin:access'], 'deliveries:admin', true);

// 5. sharon permissions should NOT grant admin:access
const sharonPerms = ["analytics:purchase-suggestions:read","analytics:read","dashboard:access","analytics:purchase-report:read","analytics:transits-report:read"];
test(sharonPerms, 'admin:access', false);
test(sharonPerms, 'dashboard:access', true);
test(sharonPerms, 'analytics:read', true);

console.log("\nALL PERMISSION TREE TESTS PASSED SUCCESSFULLY!");
