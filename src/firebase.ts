import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// I've extracted your real API Key from your google-services.json file!
const firebaseConfig = {
  apiKey: "AIzaSyCzNIXUMuu8JZ_7gqS_bLeSqc8_QBy1vmU",
  authDomain: "no-nav-ai.firebaseapp.com",
  projectId: "no-nav-ai",
  storageBucket: "no-nav-ai.firebasestorage.app",
  messagingSenderId: "265725982930",
  // Note: If you get a 'web-app-id' error, go to Firebase Console -> Project Settings
  // -> General -> Your Apps -> Add Web App (</>) to get a valid App ID.
  appId: "1:265725982930:web:6d89013023988120bfd50b"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
