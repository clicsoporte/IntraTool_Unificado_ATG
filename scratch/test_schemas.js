const { z } = require('zod');

const preprocessIsActive = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return undefined;
    if (typeof val === 'string') {
      const parsed = parseInt(val, 10);
      return isNaN(parsed) ? undefined : parsed;
    }
    if (typeof val === 'boolean') {
      return val ? 1 : 0;
    }
    return val;
  },
  z.number().int().optional()
);

const UserSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  is_active: preprocessIsActive,
});

console.log("Testing with string active (1):", UserSchema.safeParse({ id: 1, name: "Test", is_active: "1" }));

console.log("Testing with float string active (1.0):", UserSchema.safeParse({ id: 1, name: "Test", is_active: "1.0" }));

console.log("Testing with number active (1):", UserSchema.safeParse({ id: 1, name: "Test", is_active: 1 }));

console.log("Testing with boolean active (true):", UserSchema.safeParse({ id: 1, name: "Test", is_active: true }));

console.log("Testing with null active:", UserSchema.safeParse({ id: 1, name: "Test", is_active: null }));
