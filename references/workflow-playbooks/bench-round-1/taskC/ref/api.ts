export function fetchUser(id: number) { return { fullName: "User" + id, age: 20 + (id % 10), id }; }
