import { getUser } from "./api";
export function isAdult(id: number) { return getUser(id).age >= 18; }
