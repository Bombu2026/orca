import { fetchUser } from "./api";
export function label(id: number) { const u = fetchUser(id); return u.fullName + " (" + u.age + ")"; }
