import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, addDoc, onSnapshot, collection, updateDoc, deleteDoc } from 'firebase/firestore';

// --- CONFIGURAZIONE E UTILS FIREBASE ---


// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDfva9-W7NOVruRI563c5waNCh9x4Aw82w",
  authDomain: "padel-challenge-pubblico.firebaseapp.com",
  projectId: "padel-challenge-pubblico",
  storageBucket: "padel-challenge-pubblico.firebasestorage.app",
  messagingSenderId: "524551628066",
  appId: "1:524551628066:web:6d78bb7589e291f157f17b",
  measurementId: "G-86PLGDTN8T"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);






};
// ----------------------------------------------------------------

// Stiamo ignorando le variabili dell'ambiente di sviluppo Canvas per la build pubblica
// Usiamo il projectId come ID dell'app per la collezione pubblica
const appId = FIREBASE_SDK_CONFIG.projectId; 
const firebaseConfig = FIREBASE_SDK_CONFIG;
const initialAuthToken = null; // Token non necessario in produzione pubblica

// Stato globale di Firebase
let db = null;
let auth = null;

if (firebaseConfig.projectId !== "INSERISCI_TUO_PROJECT_ID") { // Esegui l'inizializzazione solo se i placeholder sono stati sostituiti
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
  } catch (error) {
    console.error("Errore nell'inizializzazione di Firebase:", error);
  }
} else {
    console.warn("ATTENZIONE: La configurazione Firebase non è stata completata. I dati non saranno salvati.");
}


// Struttura di configurazione di default
const DEFAULT_CONFIG = {
    playerA: 'Player A',
    playerB: 'Player B',
    playerC: 'Player C',
    playerD: 'Player D',
    teamAlphaName: 'Team Alpha',
    teamBetaName: 'Team Beta',
    // Campi di default per loghi e foto
    teamAlphaLogo: 'https://placehold.co/100x100/10B981/ffffff?text=T_A', 
    teamBetaLogo: 'https://placehold.co/100x100/4F46E5/ffffff?text=T_B',
    playerAPhoto: 'https://placehold.co/50x50/cccccc/333333?text=A',
    playerBPhoto: 'https://placehold.co/50x50/cccccc/333333?text=B',
    playerCPhoto: 'https://placehold.co/50x50/cccccc/333333?text=C',
    playerDPhoto: 'https://placehold.co/50x50/cccccc/333333?text=D',
    requiredPlayers: 4
};


// Funzione per definire i team dinamicamente
const TEAMS = (config) => ({
    ALPHA: { 
        id: 'alpha', 
        name: config.teamAlphaName, 
        players: [config.playerA, config.playerB], 
        color: 'bg-emerald-500', 
        playerIds: ['playerA', 'playerB'],
        logo: config.teamAlphaLogo,
        playerPhotos: { [config.playerA]: config.playerAPhoto, [config.playerB]: config.playerBPhoto }
    },
    BETA: { 
        id: 'beta', 
        name: config.teamBetaName, 
        players: [config.playerC, config.playerD], 
        color: 'bg-indigo-500', 
        playerIds: ['playerC', 'playerD'],
        logo: config.teamBetaLogo,
        playerPhotos: { [config.playerC]: config.playerCPhoto, [config.playerD]: config.playerDPhoto }
    },
});


// Funzione per l'autenticazione
const useFirebaseInit = () => {
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    if (!auth || !db) {
      console.error("Firebase non è stato inizializzato correttamente.");
      setIsAuthReady(true);
      return;
    }
    
    // Tenta il sign-in usando il token personalizzato o in modo anonimo
    const signInUser = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
        
        // Aggiorna l'ID utente dopo il sign-in
        if (auth.currentUser) {
            setUserId(auth.currentUser.uid);
        }
      } catch (error) {
        console.error("Errore durante l'autenticazione. Tentativo di fallback anonimo:", error);
        if (!auth.currentUser) {
            try {
                await signInAnonymously(auth);
                if (auth.currentUser) {
                    setUserId(auth.currentUser.uid);
                }
            } catch (fallbackError) {
                console.error("Errore finale nell'autenticazione anonima:", fallbackError);
            }
        }
      } finally {
        // ESSENZIALE: Dichiara l'app pronta SOLO dopo che tutti i tentativi di sign-in sono conclusi.
        setIsAuthReady(true);
      }
    };

    signInUser();

    // Ritorna una funzione di pulizia vuota, poiché onAuthStateChanged non è usato qui
    return () => {}; 
  }, []);

  return { db, auth, userId, isAuthReady };
};

// --- LOGICA DEL GIOCO E CALCOLO PUNTEGGI ---

/**
 * Calcola i punti basati sulle regole specificate.
 * Regole: 3pt (2-0), 2pt (2-1), 1pt (1-1 con più game totali)
 * @param {string[]} setScores - Array di stringhe "GameT1-GameT2", es: ["6-4", "4-6", "6-3"]
 * @returns {{ pointsT1: number, pointsT2: number, winnerId: 'alpha' | 'beta' | null, gamesT1: number, gamesT2: number, setsT1: number, setsT2: number }}
 */
const calculatePoints = (setScores) => {
    let setsT1 = 0;
    let setsT2 = 0;
    let gamesT1 = 0;
    let gamesT2 = 0;

    for (const score of setScores) {
        if (!score || !score.includes('-')) continue;
        const [g1, g2] = score.split('-').map(Number);

        if (g1 > g2) {
            setsT1 += 1;
        } else if (g2 > g1) {
            setsT2 += 1;
        }
        gamesT1 += g1;
        gamesT2 += g2;
    }

    let pointsT1 = 0;
    let pointsT2 = 0;
    let winnerId = null;

    // Caso 1 & 2: Vittoria 2-0 o 2-1
    if (setsT1 === 2) {
        pointsT1 = setsT2 === 0 ? 3 : 2;
        winnerId = 'alpha';
    } else if (setsT2 === 2) {
        pointsT2 = setsT1 === 0 ? 3 : 2;
        winnerId = 'beta';
    }
    // Caso 3: Pareggio 1-1 (solo se la partita è finita in 2 set)
    else if (setsT1 === 1 && setsT2 === 1 && setScores.length === 2) {
        if (gamesT1 > gamesT2) {
            pointsT1 = 1;
            winnerId = 'alpha';
        } else if (gamesT2 > gamesT1) {
            pointsT2 = 1;
            winnerId = 'beta';
        }
        // Se gamesT1 === gamesT2, 0 punti ad entrambi (pareggio completo)
    }

    // Aggiunta di setsT1 e setsT2 all'oggetto restituito per il tracking totale
    return { pointsT1, pointsT2, winnerId, gamesT1, gamesT2, setsT1, setsT2 }; 
};

// --- COMPONENTE PRINCIPALE APP ---

const PadelApp = () => {
  const { db, userId, isAuthReady } = useFirebaseInit();
  const [activeTab, setActiveTab] = useState('ranking');
  const [matches, setMatches] = useState([]);
  const [availabilities, setAvailabilities] = useState([]);
  const [userName, setUserName] = useState(null);
  const [appConfig, setAppConfig] = useState(DEFAULT_CONFIG);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [currentPlayerName, setCurrentPlayerName] = useState('');
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  // Stato per la modifica della partita
  const [editingMatch, setEditingMatch] = useState(null); 


  const currentTeams = TEAMS(appConfig);

  // 1. Caricamento Configurazione Pubblica (Nomi Giocatori e Team)
  useEffect(() => {
    if (!isAuthReady || !db) return; // Protezione per Firebase

    const configDocRef = doc(db, `artifacts/${appId}/public/data/config`, 'playerNames');
    const unsubscribe = onSnapshot(configDocRef, (docSnap) => {
        if (docSnap.exists()) {
            // Assicurati che i nuovi campi siano caricati correttamente, usando i default se mancanti
            setAppConfig(prev => ({ ...DEFAULT_CONFIG, ...docSnap.data() }));
        } else {
            // Se la configurazione non esiste (probabilmente primo utente), la salviamo
            setDoc(configDocRef, DEFAULT_CONFIG, { merge: true }).catch(e => console.error("Error setting default config:", e));
        }
    });
    return () => unsubscribe();
  }, [isAuthReady, db]);


  // 2. Dati Iniziali e Setup Utente (Nome)
  useEffect(() => {
    // Dipende da userId, quindi deve attendere che l'autenticazione sia completa E l'ID sia stato impostato
    if (!isAuthReady || !db || !userId) return; 

    // Carica o imposta il nome dell'utente
    const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/config`, 'userProfile');
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().name) {
        setUserName(docSnap.data().name);
      } else {
        // Se non ha un nome, apri la modale per impostarlo
        if (!userName) {
            setModalMessage("Benvenuto! Prima di iniziare, inserisci il tuo nome per partecipare alla sfida.");
            setIsModalOpen(true);
        }
      }
    });
    return () => unsubscribe();
  }, [isAuthReady, db, userId]);


  // 3. Listener per i Match (Classifica)
  useEffect(() => {
    if (!isAuthReady || !db) return; // Protezione per Firebase

    const matchesCollectionRef = collection(db, `artifacts/${appId}/public/data/matches`);
    const unsubscribe = onSnapshot(matchesCollectionRef, (snapshot) => {
        const matchesData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            date: doc.data().date || 'Data Sconosciuta'
        }));
        matchesData.sort((a, b) => new Date(b.date) - new Date(a.date));
        setMatches(matchesData);
    });
    return () => unsubscribe();
  }, [isAuthReady, db]);

  // 4. Listener per la Disponibilità (Planning)
  useEffect(() => {
    if (!isAuthReady || !db) return; // Protezione per Firebase

    const availCollectionRef = collection(db, `artifacts/${appId}/public/data/availability`);
    const unsubscribe = onSnapshot(availCollectionRef, (snapshot) => {
        const availData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        setAvailabilities(availData);
    });
    return () => unsubscribe();
  }, [isAuthReady, db]);

  // Funzione per salvare il nome
  const saveUserName = async () => {
    if (!db || !userId || !currentPlayerName.trim()) {
        setModalMessage('Inserisci un nome valido.');
        return;
    }
    try {
        const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/config`, 'userProfile');
        await setDoc(userDocRef, { name: currentPlayerName.trim() }, { merge: true });
        setUserName(currentPlayerName.trim());
        setIsModalOpen(false);
        setModalMessage('');
    } catch (error) {
        console.error("Errore salvataggio nome:", error);
        setModalMessage("Errore nel salvataggio del nome. Riprova.");
    }
  };

  // Funzione per cancellare una partita
  const deleteMatch = async (matchId) => {
      if (!db) return;
      try {
          const matchDocRef = doc(db, `artifacts/${appId}/public/data/matches`, matchId);
          await deleteDoc(matchDocRef);
          // La ricarica dei match è automatica grazie a onSnapshot
      } catch (error) {
          console.error("Errore durante la cancellazione della partita:", error);
          alert("Si è verificato un errore durante la cancellazione."); 
      }
  };

  const handleConfirmDelete = (matchId) => {
      setConfirmModal({
          isOpen: true,
          title: 'Conferma Eliminazione Partita',
          message: 'Sei sicuro di voler eliminare questo risultato? Questa azione è irreversibile e aggiornerà la classifica.',
          onConfirm: () => {
              deleteMatch(matchId);
              setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} });
          }
      });
  };

  // Logica di calcolo della Classifica
  const ranking = useMemo(() => {
    const teams = currentTeams;
    const scores = {
        [teams.ALPHA.id]: { points: 0, wins: 0, losses: 0, totalGamesWon: 0, totalSetsWon: 0, totalSetsLost: 0 },
        [teams.BETA.id]: { points: 0, wins: 0, losses: 0, totalGamesWon: 0, totalSetsWon: 0, totalSetsLost: 0 },
    };

    matches.forEach(match => {
        scores[teams.ALPHA.id].points += match.pointsT1 || 0;
        scores[teams.BETA.id].points += match.pointsT2 || 0;
        scores[teams.ALPHA.id].totalGamesWon += match.gamesT1 || 0;
        scores[teams.BETA.id].totalGamesWon += match.gamesT2 || 0;

        // Aggregazione Set Totali
        scores[teams.ALPHA.id].totalSetsWon += match.setsT1 || 0;
        scores[teams.ALPHA.id].totalSetsLost += match.setsT2 || 0;

        scores[teams.BETA.id].totalSetsWon += match.setsT2 || 0;
        scores[teams.BETA.id].totalSetsLost += match.setsT1 || 0;

        if (match.winnerId === teams.ALPHA.id) {
            scores[teams.ALPHA.id].wins += 1;
            scores[teams.BETA.id].losses += 1;
        } else if (match.winnerId === teams.BETA.id) {
            scores[teams.BETA.id].wins += 1;
            scores[teams.ALPHA.id].losses += 1;
        }
    });

    return [
        { ...teams.ALPHA, ...scores[teams.ALPHA.id] },
        { ...teams.BETA, ...scores[teams.BETA.id] }
    ].sort((a, b) => b.points - a.points);
  }, [matches, appConfig]); // Dipende anche da appConfig per i nomi dei team

  // Logica di calcolo del Planning
  const sharedAvailability = useMemo(() => {
    if (!isAuthReady || availabilities.length === 0) return [];

    const dateCounts = {};

    availabilities.forEach(userAvail => {
        userAvail.freeDates.forEach(date => {
            dateCounts[date] = (dateCounts[date] || 0) + 1;
        });
    });

    const requiredCount = appConfig.requiredPlayers || 4;
    const sharedDates = Object.entries(dateCounts)
        .filter(([, count]) => count >= requiredCount)
        .map(([date]) => date)
        .sort((a, b) => new Date(a) - new Date(b));

    return sharedDates;
  }, [availabilities, appConfig.requiredPlayers, isAuthReady]);


  if (!isAuthReady) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <div className="text-xl font-semibold text-gray-700">Caricamento App Padel...</div>
      </div>
    );
  }

  if (!userName) {
    return (
      <SetupModal
        isOpen={isModalOpen}
        message={modalMessage}
        currentPlayerName={currentPlayerName}
        setCurrentPlayerName={setCurrentPlayerName}
        saveUserName={saveUserName}
      />
    );
  }

  const userAvail = availabilities.find(a => a.id === userId) || { freeDates: [] };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      {/* Modale di Conferma Universale */}
      <ConfirmModal 
          isOpen={confirmModal.isOpen} 
          title={confirmModal.title} 
          message={confirmModal.message} 
          onConfirm={confirmModal.onConfirm} 
          onCancel={() => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} })}
      />
      
      {/* Modale di Modifica Partita */}
      {editingMatch && (
          <EditMatchModal
              db={db}
              appId={appId}
              matchData={editingMatch}
              teams={currentTeams}
              onClose={() => setEditingMatch(null)}
          />
      )}

      <header className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 border-b-4 border-emerald-500 pb-2">
          Padel Challenge: {userName}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          La sfida continua! Sei autenticato come: {userId}
        </p>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        <TabButton id="ranking" activeTab={activeTab} setActiveTab={setActiveTab}>
          Ranking & Risultati
        </TabButton>
        <TabButton id="match_entry" activeTab={activeTab} setActiveTab={setActiveTab}>
          Aggiungi Partita
        </TabButton>
        <TabButton id="planning" activeTab={activeTab} setActiveTab={setActiveTab}>
          Planning & Disponibilità
        </TabButton>
        <TabButton id="config" activeTab={activeTab} setActiveTab={setActiveTab}>
          Configurazione Squadre
        </TabButton>
      </div>

      {/* Contenuto del Tab */}
      <main>
        {activeTab === 'ranking' && <RankingView ranking={ranking} matches={matches} teams={currentTeams} onDelete={handleConfirmDelete} onEdit={setEditingMatch} />}
        {activeTab === 'match_entry' && <MatchEntry db={db} appId={appId} userId={userId} teams={currentTeams} />}
        {activeTab === 'planning' && (
            <PlanningView
                db={db}
                appId={appId}
                userId={userId}
                userName={userName}
                userAvail={userAvail}
                allAvailabilities={availabilities}
                sharedAvailability={sharedAvailability}
                requiredPlayers={appConfig.requiredPlayers}
            />
        )}
        {activeTab === 'config' && <ConfigView db={db} appId={appId} currentConfig={appConfig} />}
      </main>
    </div>
  );
};

// --- COMPONENTI UI ---

const TabButton = ({ id, activeTab, setActiveTab, children }) => (
    <button
        onClick={() => setActiveTab(id)}
        className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ease-in-out whitespace-nowrap
            ${activeTab === id
                ? 'border-b-4 border-emerald-500 text-emerald-600'
                : 'text-gray-500 hover:text-emerald-500'
            }`}
    >
        {children}
    </button>
);

const SetupModal = ({ isOpen, message, currentPlayerName, setCurrentPlayerName, saveUserName }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl p-8 shadow-2xl w-full max-w-md">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Configurazione Iniziale</h2>
                <p className="text-gray-600 mb-6">{message}</p>
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Il tuo nome</label>
                    <input
                        type="text"
                        value={currentPlayerName}
                        onChange={(e) => setCurrentPlayerName(e.target.value)}
                        placeholder="Es: Andrea"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                    />
                </div>
                <button
                    onClick={saveUserName}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-150"
                >
                    Salva e Accedi
                </button>
            </div>
        </div>
    );
};

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl p-6 shadow-2xl w-full max-w-sm">
                <h3 className="text-xl font-bold text-red-600 mb-3">{title}</h3>
                <p className="text-gray-700 mb-6">{message}</p>
                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition duration-150"
                    >
                        Annulla
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition duration-150"
                    >
                        Conferma Eliminazione
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- VISTA CLASSIFICA ---

const MatchItem = ({ match, teams, onDelete, onEdit }) => {
    const team1 = teams.ALPHA;
    const team2 = teams.BETA;
    const isWinner1 = match.winnerId === team1.id;
    const isWinner2 = match.winnerId === team2.id;
    
    // Testo del vincitore dinamico 
    const winnerText = isWinner1 ? team1.name : isWinner2 ? team2.name : 'PAREGGIO'; 
    // Colore del badge: team vincente o grigio per pareggio
    const badgeColor = isWinner1 ? team1.color : isWinner2 ? team2.color : 'bg-gray-400';

    return (
        <div className={`p-4 rounded-xl border-l-4 ${isWinner1 ? team1.color : isWinner2 ? team2.color : 'border-gray-300'} shadow-sm bg-gray-50`}>
            <div className="flex justify-between items-start mb-2">
                {/* Contrasto aumentato per la data */}
                <p className="text-xs text-gray-800 font-mono">{match.date}</p> 
                <div className="flex items-center space-x-2">
                    {/* Visualizza il nome del team vincitore o PAREGGIO */}
                    <p className={`font-bold text-sm px-2 py-0.5 rounded-full ${badgeColor} text-white`}>
                        {winnerText.toUpperCase()}
                    </p>
                    <button
                        onClick={() => onEdit(match)}
                        className="text-blue-500 hover:text-blue-700 text-sm font-semibold transition duration-150"
                        title="Modifica Partita"
                    >
                        Modifica
                    </button>
                    <button 
                        onClick={() => onDelete(match.id)}
                        className="text-red-500 hover:text-red-700 text-sm font-bold opacity-70 hover:opacity-100 transition duration-150"
                        title="Elimina Partita"
                    >
                        &times;
                    </button>
                </div>
            </div>

            {/* Scoreboard */}
            <div className="grid grid-cols-5 gap-1 text-center font-mono text-sm mt-2">
                <span className="col-span-2 font-semibold">{team1.name}</span>
                <span>Set 1</span>
                <span>Set 2</span>
                <span>Set 3</span>
                {/* Team 1 Score */}
                <span className={`col-span-2 font-bold ${isWinner1 ? 'text-emerald-700' : 'text-gray-700'}`}>{match.setScores?.[0]?.split('-')[0] || '-'} - {match.setScores?.[1]?.split('-')[0] || '-'} - {match.setScores?.[2]?.split('-')[0] || '-'}</span>
                {/* Contrasto aumentato per i game totali */}
                <span className={`col-span-3 text-xs text-gray-800`}>({match.gamesT1} games)</span> 

                {/* Team 2 Score */}
                <span className={`col-span-2 font-bold ${isWinner2 ? 'text-indigo-700' : 'text-gray-700'}`}>{match.setScores?.[0]?.split('-')[1] || '-'} - {match.setScores?.[1]?.split('-')[1] || '-'} - {match.setScores?.[2]?.split('-')[1] || '-'}</span>
                {/* Contrasto aumentato per i game totali */}
                <span className={`col-span-3 text-xs text-gray-800`}>({match.gamesT2} games)</span>
            </div>
            <div className="text-right text-xs font-semibold mt-2">
                Punti: <span className="text-emerald-700">{match.pointsT1}</span> / <span className="text-indigo-700">{match.pointsT2}</span>
            </div>
        </div>
    );
};

const RankingView = ({ ranking, matches, teams, onDelete, onEdit }) => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Classifica Generale */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">Ranking</h2>
            {ranking.map((team, index) => (
                <div key={team.id} className={`p-4 mb-3 rounded-lg ${team.color} text-white shadow-md`}>
                    <div className="flex items-center justify-between mb-2 border-b border-white/50 pb-2">
                        <div className="flex items-center">
                            <span className="text-xl font-extrabold mr-4">{index + 1}°</span>
                            <img 
                                src={team.logo} 
                                alt={`Logo ${team.name}`} 
                                className="w-8 h-8 rounded-full object-cover mr-3"
                                onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/50x50/374151/ffffff?text=Logo" }}
                            />
                            <div>
                                <p className="text-lg font-semibold">{team.name}</p>
                                <p className="text-xs opacity-80">Punti Totali: {team.points}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-3">
                        <p className="text-sm font-semibold mb-1 opacity-90">Giocatori:</p>
                        <div className="flex space-x-4">
                            {team.players.map(player => (
                                <div key={player} className="flex items-center text-xs opacity-80">
                                    <img 
                                        src={team.playerPhotos[player]} 
                                        alt={player} 
                                        className="w-6 h-6 rounded-full object-cover mr-1"
                                        onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/50x50/cccccc/333333?text=P" }}
                                    />
                                    {player}
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    {/* STATISTICHE AGGIUNTIVE: Set e Games */}
                    <div className="mt-4 pt-3 border-t border-white/50 flex justify-between text-xs opacity-90">
                        <div>
                            <p className="font-semibold">{team.totalSetsWon} Set Vinti / {team.totalSetsLost} Persi</p>
                            <p className="font-semibold">{team.totalGamesWon} Games Vinti</p>
                        </div>
                        <div className="text-right">
                            <p>Vittorie: {team.wins}</p>
                            <p>Sconfitte: {team.losses}</p>
                        </div>
                    </div>
                </div>
            ))}
            <p className="text-sm text-gray-500 mt-4 italic">
                Punteggio: 3pt (2-0), 2pt (2-1), 1pt (1-1 con più game)
            </p>
        </div>

        {/* Storico Partite */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">Storico Partite ({matches.length})</h2>
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {matches.length === 0 ? (
                    <p className="text-gray-500 italic">Ancora nessuna partita registrata. Inizia aggiungendone una!</p>
                ) : (
                    matches.map((match) => (
                        <MatchItem 
                            key={match.id} 
                            match={match} 
                            teams={teams} 
                            onDelete={onDelete} 
                            onEdit={onEdit}
                        />
                    ))
                )}
            </div>
        </div>
    </div>
);


// --- VISTA AGGIUNGI PARTITA (RIUTILIZZATA PER MODIFICA) ---

/**
 * Funzione di validazione e calcolo riutilizzabile sia per Aggiungi che per Modifica.
 * Restituisce un oggetto con i dati calcolati o un errore.
 */
const validateAndCalculateScores = (setScores) => {
    const validScores = setScores.filter(s => s.trim() !== '');

    if (validScores.length < 2) {
        return { error: "Devi inserire almeno due set per considerare la partita." };
    }

    let setsT1 = 0;
    let setsT2 = 0;
    let gamesT1 = 0;
    let gamesT2 = 0;
    let completeScores = [];

    for (const scoreStr of validScores) {
        const parts = scoreStr.split('-');
        if (parts.length !== 2) {
            return { error: `Formato punteggio non valido: ${scoreStr}. Usa X-Y.` };
        }
        const g1 = parseInt(parts[0]);
        const g2 = parseInt(parts[1]);

        if (isNaN(g1) || isNaN(g2) || g1 < 0 || g2 < 0) {
            return { error: `Punteggio non numerico o negativo in: ${scoreStr}.` };
        }

        const maxGames = Math.max(g1, g2);
        const minGames = Math.min(g1, g2);
        const isStandardWin = maxGames === 6 && maxGames - minGames >= 2;
        const isTieBreakWin = maxGames === 7 && (minGames === 5 || minGames === 6);

        if (!isStandardWin && !isTieBreakWin) {
            return { error: `Punteggio set non plausibile: ${scoreStr}. Deve essere almeno 6-4, 7-5 o 7-6.` };
        }

        if (g1 > g2) setsT1++;
        if (g2 > g1) setsT2++;

        gamesT1 += g1;
        gamesT2 += g2;
        completeScores.push(`${g1}-${g2}`);
    }

    if (setsT1 < 2 && setsT2 < 2) {
        return { error: "La partita è incompleta (meno di 2 set vinti da un team)." };
    }

    if (completeScores.length === 3 && setsT1 !== 2 && setsT2 !== 2) {
        return { error: "Errore logico: con tre set inseriti, il risultato finale deve essere 2-1 per uno dei team." };
    }

    if (completeScores.length === 2 && setsT1 !== 2 && setsT2 !== 2 && setsT1 !== 1) {
        return { error: "Errore logico: con due set, il risultato deve essere 2-0 o 1-1." };
    }

    const calculatedResults = calculatePoints(completeScores);

    if (setsT1 === 1 && setsT2 === 1 && calculatedResults.pointsT1 === 0 && calculatedResults.pointsT2 === 0) {
        return { error: "Pareggio totale (1-1 nei set e games pari). Non si assegna alcun punto. Partita non valida per la classifica." };
    }

    return {
        completeScores,
        setsT1: calculatedResults.setsT1,
        setsT2: calculatedResults.setsT2,
        gamesT1: calculatedResults.gamesT1,
        gamesT2: calculatedResults.gamesT2,
        pointsT1: calculatedResults.pointsT1,
        pointsT2: calculatedResults.pointsT2,
        winnerId: calculatedResults.winnerId
    };
};


const MatchEntry = ({ db, appId, userId, teams }) => {
    const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
    const [setScores, setSetScores] = useState(['', '', '']); // Max 3 sets: "G1-G2"
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleScoreChange = (index, value) => {
        const newScores = [...setScores];
        // Permette solo numeri e trattino
        newScores[index] = value.replace(/[^0-9-]/g, '');
        setSetScores(newScores);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');
        setIsLoading(true);

        const validation = validateAndCalculateScores(setScores);

        if (validation.error) {
            setMessage(`Errore: ${validation.error}`);
            setIsLoading(false);
            return;
        }

        const { completeScores, gamesT1, gamesT2, pointsT1, pointsT2, winnerId, setsT1, setsT2 } = validation;

        try {
            const matchesCollectionRef = collection(db, `artifacts/${appId}/public/data/matches`);
            await addDoc(matchesCollectionRef, {
                date: date,
                setScores: completeScores,
                team1: teams.ALPHA.name,
                team2: teams.BETA.name,
                gamesT1: gamesT1,
                gamesT2: gamesT2,
                pointsT1: pointsT1,
                pointsT2: pointsT2,
                winnerId: winnerId,
                setsT1: setsT1, 
                setsT2: setsT2, 
                createdAt: new Date().toISOString(),
                addedBy: userId,
            });

            setMessage(`Partita registrata con successo! Punti assegnati: ${pointsT1} a ${teams.ALPHA.name}, ${pointsT2} a ${teams.BETA.name}.`);
            setSetScores(['', '', '']);
            setDate(new Date().toISOString().substring(0, 10)); // Reset date
        } catch (error) {
            console.error("Errore salvataggio partita:", error);
            setMessage("Errore nel salvataggio della partita nel database.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="max-w-xl mx-auto p-6 bg-white rounded-xl shadow-lg">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Registra Nuovo Risultato</h2>

            <div className="mb-4">
                <label htmlFor="match-date" className="block text-sm font-medium text-gray-700 mb-2">
                    Data della Partita
                </label>
                <input
                    type="date"
                    id="match-date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                />
            </div>

            <div className="space-y-4 mb-6">
                <p className="font-semibold text-gray-700">Punteggio Set (Formato: Game T1 - Game T2)</p>
                {setScores.map((score, index) => (
                    <div key={index} className="flex items-center space-x-3">
                        <label className="text-gray-500 w-16">Set {index + 1}:</label>
                        <input
                            type="text"
                            value={score}
                            onChange={(e) => handleScoreChange(index, e.target.value)}
                            placeholder="Es: 6-4"
                            className="flex-grow px-3 py-2 border border-gray-300 rounded-lg text-center"
                            disabled={index > 0 && setScores[index - 1] === ''}
                        />
                    </div>
                ))}
                <p className="text-xs text-gray-500 italic">
                    Inserisci i punteggi di {teams.ALPHA.name} ({teams.ALPHA.players.join('/')}) contro {teams.BETA.name} ({teams.BETA.players.join('/')}).
                    Lascia i campi rimanenti vuoti se la partita è finita.
                </p>
            </div>

            <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-3 px-4 rounded-lg font-bold text-white transition duration-150 ${isLoading ? 'bg-gray-400' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            >
                {isLoading ? 'Registrazione...' : 'Registra Partita'}
            </button>

            {message && (
                <div className={`mt-4 p-3 rounded-lg ${message.startsWith('Errore') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {message}
                </div>
            )}
        </form>
    );
};


const EditMatchModal = ({ db, appId, matchData, teams, onClose }) => {
    const initialScores = [
        matchData.setScores[0] || '',
        matchData.setScores[1] || '',
        matchData.setScores[2] || ''
    ];

    const [date, setDate] = useState(matchData.date || new Date().toISOString().substring(0, 10));
    const [setScores, setSetScores] = useState(initialScores);
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleScoreChange = (index, value) => {
        const newScores = [...setScores];
        newScores[index] = value.replace(/[^0-9-]/g, '');
        setSetScores(newScores);
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        setMessage('');
        setIsLoading(true);

        const validation = validateAndCalculateScores(setScores);

        if (validation.error) {
            setMessage(`Errore: ${validation.error}`);
            setIsLoading(false);
            return;
        }

        const { completeScores, gamesT1, gamesT2, pointsT1, pointsT2, winnerId, setsT1, setsT2 } = validation;

        try {
            const matchDocRef = doc(db, `artifacts/${appId}/public/data/matches`, matchData.id);
            await updateDoc(matchDocRef, {
                date: date,
                setScores: completeScores,
                gamesT1: gamesT1,
                gamesT2: gamesT2,
                pointsT1: pointsT1,
                pointsT2: pointsT2,
                winnerId: winnerId,
                setsT1: setsT1, 
                setsT2: setsT2, 
                updatedAt: new Date().toISOString(),
            });

            setMessage(`Partita modificata con successo! Punti assegnati: ${pointsT1} a ${teams.ALPHA.name}, ${pointsT2} a ${teams.BETA.name}.`);
            // Chiude la modale dopo un breve ritardo per mostrare il messaggio
            setTimeout(onClose, 1500); 
        } catch (error) {
            console.error("Errore aggiornamento partita:", error);
            setMessage("Errore nell'aggiornamento della partita nel database.");
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <form onSubmit={handleUpdate} className="bg-white rounded-xl p-8 shadow-2xl w-full max-w-lg">
                <div className="flex justify-between items-center mb-6 border-b pb-2">
                    <h2 className="text-2xl font-bold text-gray-800">Modifica Partita ({matchData.id.substring(0, 4)}...)</h2>
                    <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-900 text-3xl font-light">&times;</button>
                </div>

                <div className="mb-4">
                    <label htmlFor="match-date-edit" className="block text-sm font-medium text-gray-700 mb-2">Data della Partita</label>
                    <input
                        type="date"
                        id="match-date-edit"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>

                <div className="space-y-4 mb-6">
                    <p className="font-semibold text-gray-700">Punteggio Set (Formato: Game T1 - Game T2)</p>
                    {setScores.map((score, index) => (
                        <div key={index} className="flex items-center space-x-3">
                            <label className="text-gray-500 w-16">Set {index + 1}:</label>
                            <input
                                type="text"
                                value={score}
                                onChange={(e) => handleScoreChange(index, e.target.value)}
                                placeholder="Es: 6-4"
                                className="flex-grow px-3 py-2 border border-gray-300 rounded-lg text-center"
                                disabled={index > 0 && setScores[index - 1] === ''}
                            />
                        </div>
                    ))}
                    <p className="text-xs text-gray-500 italic">
                        Modifica i punteggi di {teams.ALPHA.name} contro {teams.BETA.name}.
                    </p>
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className={`w-full py-3 px-4 rounded-lg font-bold text-white transition duration-150 ${isLoading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                    Aggiornamento
                </button>

                {message && (
                    <div className={`mt-4 p-3 rounded-lg ${message.startsWith('Errore') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {message}
                    </div>
                )}
            </form>
        </div>
    );
}

// --- VISTA CONFIGURAZIONE ---

const ConfigView = ({ db, appId, currentConfig }) => {
    const [config, setConfig] = useState(currentConfig);
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setConfig(currentConfig);
    }, [currentConfig]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setConfig(prev => ({
            ...prev,
            [name]: name === 'requiredPlayers' ? parseInt(value) || 0 : value
        }));
    };

    const handleSave = async () => {
        if (!db) return;
        setIsLoading(true);
        setMessage('');

        const configToSave = {
            ...config,
            requiredPlayers: config.requiredPlayers > 0 ? config.requiredPlayers : 4 
        };

        try {
            const configDocRef = doc(db, `artifacts/${appId}/public/data/config`, 'playerNames');
            await setDoc(configDocRef, configToSave);
            setMessage('Configurazione salvata con successo! Ricarica le altre schede per vedere le modifiche.');
        } catch (error) {
            console.error("Errore salvataggio configurazione:", error);
            setMessage("Errore nel salvataggio della configurazione.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto p-6 bg-white rounded-xl shadow-lg">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Configurazione Challenge</h2>
            <p className="text-gray-600 mb-6">
                Personalizza i nomi dei team, dei giocatori, i loghi e le foto.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Team Alpha */}
                <div className="p-4 rounded-lg bg-emerald-50 border-l-4 border-emerald-500">
                    <h3 className="text-lg font-semibold text-emerald-800 mb-3">Team Alpha</h3>
                    <label className="block mb-4">
                        <span className="text-sm font-medium text-gray-700">Nome Team</span>
                        <input
                            type="text"
                            name="teamAlphaName"
                            value={config.teamAlphaName || ''}
                            onChange={handleChange}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                    </label>
                    <label className="block mb-4">
                        <span className="text-sm font-medium text-gray-700">Logo Team (URL Immagine)</span>
                        <input
                            type="url"
                            name="teamAlphaLogo"
                            value={config.teamAlphaLogo || ''}
                            onChange={handleChange}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                    </label>
                    
                    <h3 className="text-lg font-semibold text-emerald-800 mb-3 border-t pt-3 border-emerald-300">Giocatori</h3>
                    <div className="space-y-3">
                        {['playerA', 'playerB'].map(playerKey => (
                            <div key={playerKey}>
                                <label className="block">
                                    <span className="text-sm font-medium text-gray-700">Giocatore ({playerKey.slice(-1)})</span>
                                    <input
                                        type="text"
                                        name={playerKey}
                                        value={config[playerKey] || ''}
                                        onChange={handleChange}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </label>
                                <label className="block mt-1">
                                    <span className="text-xs font-medium text-gray-600">Foto Giocatore (URL Immagine)</span>
                                    <input
                                        type="url"
                                        name={`${playerKey}Photo`}
                                        value={config[`${playerKey}Photo`] || ''}
                                        onChange={handleChange}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                                    />
                                </label>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Team Beta */}
                <div className="p-4 rounded-lg bg-indigo-50 border-l-4 border-indigo-500">
                    <h3 className="text-lg font-semibold text-indigo-800 mb-3">Team Beta</h3>
                    <label className="block mb-4">
                        <span className="text-sm font-medium text-gray-700">Nome Team</span>
                        <input
                            type="text"
                            name="teamBetaName"
                            value={config.teamBetaName || ''}
                            onChange={handleChange}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                    </label>
                    <label className="block mb-4">
                        <span className="text-sm font-medium text-gray-700">Logo Team (URL Immagine)</span>
                        <input
                            type="url"
                            name="teamBetaLogo"
                            value={config.teamBetaLogo || ''}
                            onChange={handleChange}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                    </label>
                    <h3 className="text-lg font-semibold text-indigo-800 mb-3 border-t pt-3 border-indigo-300">Giocatori</h3>
                    <div className="space-y-3">
                        {['playerC', 'playerD'].map(playerKey => (
                            <div key={playerKey}>
                                <label className="block">
                                    <span className="text-sm font-medium text-gray-700">Giocatore ({playerKey.slice(-1)})</span>
                                    <input
                                        type="text"
                                        name={playerKey}
                                        value={config[playerKey] || ''}
                                        onChange={handleChange}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </label>
                                <label className="block mt-1">
                                    <span className="text-xs font-medium text-gray-600">Foto Giocatore (URL Immagine)</span>
                                    <input
                                        type="url"
                                        name={`${playerKey}Photo`}
                                        value={config[`${playerKey}Photo`] || ''}
                                        onChange={handleChange}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                                    />
                                </label>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-6 p-4 rounded-lg bg-gray-50 border-l-4 border-gray-500">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Regole Planning</h3>
                <label className="block">
                    <span className="text-sm font-medium text-gray-700">Giocatori richiesti per fissare la partita (default 4)</span>
                    <input
                        type="number"
                        name="requiredPlayers"
                        value={config.requiredPlayers || 4}
                        onChange={handleChange}
                        min="1"
                        max="4"
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                </label>
            </div>

            <button
                onClick={handleSave}
                disabled={isLoading}
                className={`mt-6 w-full py-3 px-4 rounded-lg font-bold text-white transition duration-150 ${isLoading ? 'bg-gray-400' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            >
                Salva Configurazione
            </button>

            {message && (
                <div className={`mt-4 p-3 rounded-lg text-center ${message.startsWith('Errore') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {message}
                </div>
            )}
        </div>
    );
};


// --- VISTA PLANNING ---

const PlanningView = ({ db, appId, userId, userName, userAvail, allAvailabilities, sharedAvailability, requiredPlayers }) => {
    const [selectedDates, setSelectedDates] = useState(userAvail.freeDates || []);
    const [message, setMessage] = useState('');
    const [showAllAvailabilities, setShowAllAvailabilities] = useState(false);

    // Sincronizza lo stato locale con i dati di Firestore
    useEffect(() => {
        setSelectedDates(userAvail.freeDates || []);
    }, [userAvail.freeDates]);

    // Tutte le date uniche registrate
    const allUniqueDates = useMemo(() => {
        const dates = new Set();
        allAvailabilities.forEach(user => {
            user.freeDates.forEach(date => {
                dates.add(date);
            });
        });
        // Filtra le date passate e ordina
        const today = new Date().toISOString().substring(0, 10);
        return Array.from(dates)
            .filter(date => date >= today)
            .sort((a, b) => new Date(a) - new Date(b));
    }, [allAvailabilities]);


    const toggleDate = (date) => {
        if (selectedDates.includes(date)) {
            setSelectedDates(selectedDates.filter(d => d !== date));
        } else {
            setSelectedDates([...selectedDates, date].sort());
        }
    };

    const handleDateChange = (e) => {
        const date = e.target.value;
        toggleDate(date);
    };

    const saveAvailability = async () => {
        if (!db || !userId) return;
        setMessage('');
        try {
            const availDocRef = doc(db, `artifacts/${appId}/public/data/availability`, userId);
            await setDoc(availDocRef, {
                userId: userId,
                userName: userName,
                freeDates: selectedDates.sort(),
                updatedAt: new Date().toISOString()
            });
            setMessage('Disponibilità aggiornata con successo!');
        } catch (error) {
            console.error("Errore salvataggio disponibilità:", error);
            setMessage('Errore nel salvataggio della disponibilità.');
        }
    };

    const today = new Date().toISOString().substring(0, 10);

    // Mappa la disponibilità per data per la tabella
    const getAvailabilityStatus = (date, userId) => {
        const user = allAvailabilities.find(a => a.id === userId);
        return user && user.freeDates.includes(date) ? '✅' : '❌';
    };

    // Nomi di tutti gli utenti che hanno espresso disponibilità
    const allUserNames = useMemo(() => {
        return allAvailabilities
            .map(a => a.userName)
            .filter((name, index, self) => self.indexOf(name) === index); // Rimuove duplicati
    }, [allAvailabilities]);


    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Input Disponibilità */}
            <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg h-fit">
                <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">La Tua Disponibilità ({userName})</h2>
                <div className="mb-4">
                    <label htmlFor="date-input" className="block text-sm font-medium text-gray-700 mb-2">
                        Seleziona/Deseleziona Date
                    </label>
                    <input
                        type="date"
                        id="date-input"
                        onChange={handleDateChange}
                        min={today}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                    />
                </div>

                <div className="mb-6 space-y-2 max-h-48 overflow-y-auto p-2 border rounded-lg">
                    <p className="text-sm font-semibold text-gray-700">Date Selezionate ({selectedDates.length}):</p>
                    {selectedDates.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">Nessuna data selezionata.</p>
                    ) : (
                        selectedDates.map(date => (
                            <div key={date} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg text-sm">
                                <span>{date}</span>
                                <button
                                    onClick={() => toggleDate(date)}
                                    className="text-red-500 hover:text-red-700 transition duration-150 font-bold"
                                    aria-label={`Rimuovi data ${date}`}
                                >
                                    &times;
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <button
                    onClick={saveAvailability}
                    className={`w-full py-3 px-4 rounded-lg font-bold text-white transition duration-150 bg-emerald-600 hover:bg-emerald-700`}
                >
                    Salva Disponibilità
                </button>
                {message && (
                    <div className={`mt-4 p-3 rounded-lg text-center ${message.startsWith('Errore') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {message}
                    </div>
                )}
            </div>

            {/* Date Comuni e Tabella di Visualizzazione */}
            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">Planning Generale</h2>

                <h3 className="text-xl font-semibold text-gray-800 mb-3">Date in Cui Tutti ({requiredPlayers}/{requiredPlayers}) Siete Liberi</h3>
                <div className="flex flex-wrap gap-3 mb-6 border p-3 rounded-lg bg-yellow-50">
                    {sharedAvailability.length === 0 ? (
                        <p className="text-gray-600 italic">Nessuna data in comune. Aggiungete più disponibilità!</p>
                    ) : (
                        sharedAvailability.map(date => (
                            <div key={date} className="px-4 py-2 bg-yellow-400 text-yellow-900 font-bold rounded-full shadow-md text-lg transform hover:scale-105 transition-transform duration-200">
                                📅 {date}
                            </div>
                        ))
                    )}
                </div>

                <h3 className="text-xl font-semibold text-gray-800 mb-3 flex justify-between items-center">
                    Tabella Completa Disponibilità
                    <button
                        onClick={() => setShowAllAvailabilities(!showAllAvailabilities)}
                        className="text-sm text-emerald-600 hover:text-emerald-800 transition duration-150"
                    >
                        {showAllAvailabilities ? 'Nascondi Dettagli' : 'Mostra Dettagli'}
                    </button>
                </h3>

                {showAllAvailabilities && allUniqueDates.length > 0 && (
                    <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">Data</th>
                                    {allAvailabilities.map(user => (
                                        <th key={user.id} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            {user.userName}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {allUniqueDates.map(date => (
                                    <tr key={date} className={sharedAvailability.includes(date) ? 'bg-green-50 font-semibold' : ''}>
                                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 sticky left-0 bg-white z-10">{date}</td>
                                        {allAvailabilities.map(user => (
                                            <td key={user.id} className="px-3 py-2 whitespace-nowrap text-center">
                                                {getAvailabilityStatus(date, user.id)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {(showAllAvailabilities && allUniqueDates.length === 0) && (
                    <p className="text-gray-500 italic mt-4">Nessuna data di disponibilità è stata ancora inserita.</p>
                )}
            </div>
        </div>
    );
};

export default PadelApp;