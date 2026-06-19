import { getUser } from "./api";
export function nameLen(id: number) { return getUser(id).name.length; }
