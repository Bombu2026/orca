import { fetchUser } from "./api";
export function isAdult(id: number) { return fetchUser(id).age >= 18; }
