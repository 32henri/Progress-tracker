import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import { auth } from "./firebase";

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

// First run only: no account exists yet, this creates the one and only
// account. Safe to leave in — Firestore rules restrict each user to their
// own doc regardless of how many accounts get created.
export async function register(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  return signOut(auth);
}
