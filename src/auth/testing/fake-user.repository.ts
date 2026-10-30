import type { User } from '../user.entity.js';

export function createFakeUserRepository() {
  const rows: User[] = [];
  let nextId = 1;
  return {
    create: (data: Partial<User>) => ({ ...data }) as User,
    save: async (user: User) => {
      user.id = String(nextId++);
      rows.push(user);
      return user;
    },
    findOne: async ({ where }: { where: Partial<User> }) =>
      rows.find((u) =>
        Object.entries(where).every(([k, v]) => u[k as keyof User] === v),
      ) ?? null,
    update: async (where: Partial<User>, patch: Partial<User>) => {
      const row = rows.find((u) => u.id === where.id);
      if (row) Object.assign(row, patch);
    },
  };
}
