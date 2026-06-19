import { fetchUser } from "./api";
export function nameLen(id: number) { return fetchUser(id).fullName.length; }
