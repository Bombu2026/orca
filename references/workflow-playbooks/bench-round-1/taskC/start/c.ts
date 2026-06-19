import { getUser } from "./api";
export function label(id: number) { const u = getUser(id); return u.name + " (" + u.age + ")"; }
