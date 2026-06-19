import { fetchUser } from "./api";
export function greet(id: number) { const u = fetchUser(id); return "Hi " + u.fullName; }
