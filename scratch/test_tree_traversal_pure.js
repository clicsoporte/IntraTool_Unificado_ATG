const fs = require('fs');
const path = require('path');

console.log("=== PARSING & TESTING ACTUAL PERMISSIONS.TS IN JS ===");

const filePath = path.join(__dirname, '../src/modules/core/lib/permissions.ts');
const content = fs.readFileSync(filePath, 'utf8');

const startIndex = content.indexOf('export const permissionTree');
if (startIndex === -1) {
    console.error("❌ FAILED: Cannot find permissionTree in file");
    process.exit(1);
}

const openBraceIndex = content.indexOf('{', startIndex);
const closeBraceIndex = content.indexOf('};', openBraceIndex);

const jsCodeBlock = content.substring(openBraceIndex + 1, closeBraceIndex);

// Evaluate the block in a sandbox
const sandbox = {};
try {
    const evalTree = eval(`({ ${jsCodeBlock} })`);
    sandbox.permissionTree = evalTree;
    console.log("Successfully parsed permissionTree object!");
} catch (e) {
    console.error("❌ Failed to parse permissionTree js block:", e);
    process.exit(1);
}

const permissionTree = sandbox.permissionTree;

function isPermissionChildOf(target, children) {
    if (children.includes(target)) return true;
    for (const child of children) {
        const subChildren = permissionTree[child];
        if (subChildren && isPermissionChildOf(target, subChildren)) {
            return true;
        }
    }
    return false;
}

function checkPermissionInTree(userPermissions, requiredPermission) {
    if (userPermissions.includes(requiredPermission)) return true;
    for (const userPerm of userPermissions) {
        const children = permissionTree[userPerm];
        if (children && isPermissionChildOf(requiredPermission, children)) {
            return true;
        }
    }
    return false;
}

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
