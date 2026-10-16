import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Config from your Firebase project settings (safe to be public — Firestore
// security rules are what actually gate access, not this object).
const firebaseConfig = {
  apiKey: "AIzaSyCM4m3ZWwZ5BBrqIe7W-IQ3fYWSZSqnO9Q",
  authDomain: "progress-tracker-406e8.firebaseapp.com",
  projectId: "progress-tracker-406e8",
  storageBucket: "progress-tracker-406e8.firebasestorage.app",
  messagingSenderId: "220241663717",
  appId: "1:220241663717:web:6c95d46d4292b92460260c",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
