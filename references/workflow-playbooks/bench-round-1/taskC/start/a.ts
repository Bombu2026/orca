import { getUser } from "./api";
export function greet(id: number) { const u = getUser(id); return "Hi " + u.name; }
