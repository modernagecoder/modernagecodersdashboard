// =============================================================
// FIREBASE CONFIG AND INITIALIZATION (Shared Module)
// =============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore, collection, addDoc, query, where, onSnapshot,
    doc, updateDoc, deleteDoc, orderBy, setDoc, getDoc, getDocs, writeBatch,
    getCountFromServer, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBrEYubOCWRP-Dowqo9AvxEGFRea1YQzl4",
    authDomain: "modernagecodersdashboard.firebaseapp.com",
    projectId: "modernagecodersdashboard",
    storageBucket: "modernagecodersdashboard.firebasestorage.app",
    messagingSenderId: "1038030973429",
    appId: "1:1038030973429:web:bbba63274daf2ce12d18bc"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Re-export everything needed by other modules
export {
    app, auth, db,
    // Auth functions
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    onAuthStateChanged, signOut,
    // Firestore functions
    collection, addDoc, query, where, onSnapshot,
    doc, updateDoc, deleteDoc, orderBy, setDoc, getDoc, getDocs, writeBatch,
    getCountFromServer, limit, serverTimestamp
};
