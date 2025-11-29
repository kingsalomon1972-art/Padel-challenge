import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, addDoc, onSnapshot, collection, updateDoc, deleteDoc, query } from 'firebase/firestore';

// --- CONFIGURAZIONE E UTILS FIREBASE (AMBIENTE CANVAS) ---
const FIREBASE_SDK_CONFIG = {
    apiKey: "AIzaSyDfva9-W7NOVruRI563c5waNCh9x4Aw82w",
    authDomain: "padel-challenge-pubblico.firebaseapp.com",
    projectId: "padel-challenge-pubblico",
    storageBucket: "padel-challenge-pubblico.firebasestorage.app",
    messagingSenderId: "524551628066",
    appId: "1:524551628066:web:6d78bb7589e291f157f17b",
    }




const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let db = null;
let auth = null;

if (firebaseConfig) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
  } catch (error) {
    console.error("Errore init Firebase:", error);
  }
}

// --- CONFIGURAZIONE DEFAULT (6 GIOCATORI) ---

const DEFAULT_CONFIG = {
    playerA: 'Player A', playerB: 'Player B',
    playerC: 'Player C', playerD: 'Player D',
    playerE: 'Player E', playerF: 'Player F',
    
    teamAlphaName: 'Team Alpha', teamBetaName: 'Team Beta', teamGammaName: 'Team Gamma',
    
    teamAlphaLogo: 'https://placehold.co/100x100/10B981/ffffff?text=A', 
    teamBetaLogo: 'https://placehold.co/100x100/4F46E5/ffffff?text=B',
    teamGammaLogo: 'https://placehold.co/100x100/F59E0B/ffffff?text=G',
    
    playerAPhoto: 'https://placehold.co/50x50/ccc/333?text=A', playerBPhoto: 'https://placehold.co/50x50/ccc/333?text=B',
    playerCPhoto: 'https://placehold.co/50x50/ccc/333?text=C', playerDPhoto: 'https://placehold.co/50x50/ccc/333?text=D',
    playerEPhoto: 'https://placehold.co/50x50/ccc/333?text=E', playerFPhoto: 'https://placehold.co/50x50/ccc/333?text=F',

    requiredPlayers: 4
};

const TEAMS = (config) => ({
    ALPHA: { id: 'alpha', name: config.teamAlphaName, players: [config.playerA, config.playerB], color: 'bg-emerald-500', logo: config.teamAlphaLogo, playerPhotos: { [config.playerA]: config.playerAPhoto, [config.playerB]: config.playerBPhoto } },
    BETA: { id: 'beta', name: config.teamBetaName, players: [config.playerC, config.playerD], color: 'bg-indigo-500', logo: config.teamBetaLogo, playerPhotos: { [config.playerC]: config.playerCPhoto, [config.playerD]: config.playerDPhoto } },
    GAMMA: { id: 'gamma', name: config.teamGammaName, players: [config.playerE, config.playerF], color: 'bg-amber-500', logo: config.teamGammaLogo, playerPhotos: { [config.playerE]: config.playerEPhoto, [config.playerF]: config.playerFPhoto } },
});

// --- HOOK AUTENTICAZIONE ---
const useFirebaseInit = () => {
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    if (!auth || !db) { setIsAuthReady(true); return; }
    const initAuth = async () => {
        try {
            if (initialAuthToken) await signInWithCustomToken(auth, initialAuthToken);
            else await signInAnonymously(auth);
        } catch (e) { await signInAnonymously(auth); }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => { setUserId(u ? u.uid : null); setIsAuthReady(true); });
  }, []);
  return { db, auth, userId, isAuthReady };
};

// --- CALCOLO PUNTEGGI ---
// Ritorna 1 se vince team1, 2 se vince team2, 0 se pareggio
const calculatePoints = (setScores) => {
    let setsT1 = 0, setsT2 = 0, gamesT1 = 0, gamesT2 = 0;
    for (const score of setScores) {
        if (!score || !score.includes('-')) continue;
        const [g1, g2] = score.split('-').map(Number);
        if (g1 > g2) setsT1++; else if (g2 > g1) setsT2++;
        gamesT1 += g1; gamesT2 += g2;
    }

    let pointsT1 = 0, pointsT2 = 0, winnerCode = 0; // 0: draw, 1: T1, 2: T2

    if (setsT1 === 2) {
        pointsT1 = setsT2 === 0 ? 3 : 2;
        winnerCode = 1;
    } else if (setsT2 === 2) {
        pointsT2 = setsT1 === 0 ? 3 : 2;
        winnerCode = 2;
    } else if (setsT1 === 1 && setsT2 === 1 && setScores.length === 2) {
        if (gamesT1 > gamesT2) { pointsT1 = 1; winnerCode = 1; }
        else if (gamesT2 > gamesT1) { pointsT2 = 1; winnerCode = 2; }
    }
    
    return { pointsT1, pointsT2, winnerCode, gamesT1, gamesT2, setsT1, setsT2 }; 
};

// --- COMPONENTE PRINCIPALE ---

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
  const [editingMatch, setEditingMatch] = useState(null);

  const currentTeams = useMemo(() => TEAMS(appConfig), [appConfig]);

  // Loaders
  useEffect(() => {
    if (!isAuthReady || !db) return;
    // Config
    const unsubConfig = onSnapshot(doc(db, `artifacts/${appId}/public/data/config`, 'playerNames'), (s) => {
        if (s.exists()) setAppConfig(prev => ({ ...DEFAULT_CONFIG, ...s.data() }));
        else setDoc(doc(db, `artifacts/${appId}/public/data/config`, 'playerNames'), DEFAULT_CONFIG, { merge: true });
    });
    // User Profile
    let unsubUser = () => {};
    if (userId) {
        unsubUser = onSnapshot(doc(db, `artifacts/${appId}/users/${userId}/config`, 'userProfile'), (s) => {
            if (s.exists() && s.data().name) setUserName(s.data().name);
            else if (!userName) { setModalMessage("Inserisci il tuo nome:"); setIsModalOpen(true); }
        });
    }
    // Matches
    const unsubMatches = onSnapshot(query(collection(db, `artifacts/${appId}/public/data/matches`)), (s) => {
        const d = s.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        d.sort((a, b) => new Date(b.date) - new Date(a.date));
        setMatches(d);
    });
    // Availability
    const unsubAvail = onSnapshot(collection(db, `artifacts/${appId}/public/data/availability`), (s) => {
        setAvailabilities(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubConfig(); unsubUser(); unsubMatches(); unsubAvail(); };
  }, [isAuthReady, db, userId]); // removed userName to avoid loop

  const saveUserName = async () => {
    if (!db || !userId || !currentPlayerName.trim()) return;
    await setDoc(doc(db, `artifacts/${appId}/users/${userId}/config`, 'userProfile'), { name: currentPlayerName.trim() }, { merge: true });
    setUserName(currentPlayerName.trim()); setIsModalOpen(false);
  };

  const deleteMatchFn = async (mid) => { if (db) await deleteDoc(doc(db, `artifacts/${appId}/public/data/matches`, mid)); };

  // --- CALCOLO CLASSIFICA DINAMICO ---
  const ranking = useMemo(() => {
    const stats = {};
    // Init stats for all teams
    Object.keys(currentTeams).forEach(k => {
        const tId = currentTeams[k].id;
        stats[tId] = { id: tId, ...currentTeams[k], points: 0, wins: 0, losses: 0, setsW: 0, setsL: 0 };
    });

    matches.forEach(m => {
        // Compatibilità retroattiva: se mancano gli ID, assumiamo Alpha vs Beta
        const t1Id = m.team1Id || 'alpha';
        const t2Id = m.team2Id || 'beta';
        
        // Se il match coinvolge team che non esistono più nella config, saltalo o gestiscilo
        if (!stats[t1Id] || !stats[t2Id]) return;

        stats[t1Id].points += m.pointsT1 || 0;
        stats[t2Id].points += m.pointsT2 || 0;
        stats[t1Id].setsW += m.setsT1 || 0; stats[t1Id].setsL += m.setsT2 || 0;
        stats[t2Id].setsW += m.setsT2 || 0; stats[t2Id].setsL += m.setsT1 || 0;

        if (m.winnerId === t1Id) { stats[t1Id].wins++; stats[t2Id].losses++; }
        else if (m.winnerId === t2Id) { stats[t2Id].wins++; stats[t1Id].losses++; }
    });

    return Object.values(stats).sort((a, b) => b.points - a.points);
  }, [matches, currentTeams]);

  if (!isAuthReady) return <div className="flex h-screen items-center justify-center">Caricamento...</div>;
  if (!userName) return <SetupModal isOpen={isModalOpen} message={modalMessage} val={currentPlayerName} setVal={setCurrentPlayerName} onSave={saveUserName} />;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 font-sans text-gray-800">
      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal({isOpen: false, onConfirm: ()=>{}})} />
      {editingMatch && <EditMatchModal db={db} appId={appId} match={editingMatch} teams={currentTeams} onClose={() => setEditingMatch(null)} />}

      <header className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 border-b-4 border-emerald-500 pb-2">Padel Challenge</h1>
        <p className="text-sm text-gray-500 mt-1">Ciao, {userName}</p>
      </header>
      
      <div className="flex overflow-x-auto border-b mb-6 gap-2">
        {['ranking', 'match_entry', 'planning', 'config'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-2 font-bold capitalize ${activeTab === t ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-gray-500'}`}>{t.replace('_', ' ')}</button>
        ))}
      </div>

      <main>
        {activeTab === 'ranking' && <RankingView ranking={ranking} matches={matches} teams={currentTeams} onDelete={(id) => setConfirmModal({isOpen:true, title:'Elimina', message:'Sicuro?', onConfirm:()=>deleteMatchFn(id)})} onEdit={setEditingMatch} />}
        {activeTab === 'match_entry' && <MatchEntry db={db} appId={appId} userId={userId} teams={currentTeams} />}
        {activeTab === 'planning' && <PlanningView db={db} appId={appId} userId={userId} userName={userName} myAvail={availabilities.find(a=>a.id===userId)||{freeDates:[]}} allAvail={availabilities} reqPlayers={appConfig.requiredPlayers} />}
        {activeTab === 'config' && <ConfigView db={db} appId={appId} config={appConfig} />}
      </main>
    </div>
  );
};

// --- SOTTO-COMPONENTI ---

const RankingView = ({ ranking, matches, teams, onDelete, onEdit }) => (
    <div className="grid lg:grid-cols-3 gap-8">
        {/* Classifica */}
        <div className="bg-white p-6 rounded-xl shadow lg:col-span-1">
            <h2 className="text-2xl font-bold mb-4">Ranking</h2>
            {ranking.map((t, i) => (
                <div key={t.id} className={`p-4 mb-3 rounded-lg ${t.color} text-white shadow relative`}>
                    <div className="flex items-center justify-between border-b border-white/20 pb-2 mb-2">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl font-black">{i+1}°</span>
                            <img src={t.logo} className="w-10 h-10 rounded-full bg-white/20 object-cover" alt="logo"/>
                            <div>
                                <div className="font-bold">{t.name}</div>
                                <div className="text-xs opacity-90">{t.points} Punti</div>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                        {t.players.map(p => (
                            <div key={p} className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded-full text-xs">
                                {t.playerPhotos[p] && <img src={t.playerPhotos[p]} className="w-5 h-5 rounded-full object-cover" alt="p"/>} 
                                {p}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
        
        {/* Storico */}
        <div className="bg-white p-6 rounded-xl shadow lg:col-span-2">
            <h2 className="text-2xl font-bold mb-4">Storico ({matches.length})</h2>
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {matches.map(m => {
                    // Risoluzione dinamica dei team per questo match
                    const t1Id = m.team1Id || 'alpha';
                    const t2Id = m.team2Id || 'beta';
                    
                    // Trova l'oggetto team corrispondente (cerca in values di teams)
                    const teamList = Object.values(teams);
                    const t1 = teamList.find(t => t.id === t1Id) || { name: '?', color: 'bg-gray-400' };
                    const t2 = teamList.find(t => t.id === t2Id) || { name: '?', color: 'bg-gray-400' };

                    const winId = m.winnerId;
                    let badgeText = 'Pareggio', badgeColor = 'bg-gray-400';
                    
                    if (winId === t1Id) { badgeText = t1.name; badgeColor = t1.color; }
                    else if (winId === t2Id) { badgeText = t2.name; badgeColor = t2.color; }

                    return (
                        <div key={m.id} className="border-l-4 border-gray-300 p-3 bg-gray-50 rounded shadow-sm relative group">
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                                <span>{m.date}</span>
                                <span className={`font-bold px-2 rounded text-white ${badgeColor}`}>{badgeText}</span>
                            </div>
                            <div className="grid grid-cols-3 text-center font-mono text-sm py-1 items-center">
                                <div className="font-bold text-gray-700 truncate px-1">{t1.name}</div>
                                <div className="text-gray-900 font-bold">{m.setScores?.join('  |  ')}</div>
                                <div className="font-bold text-gray-700 truncate px-1">{t2.name}</div>
                            </div>
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                <button onClick={()=>onEdit(m)} className="text-blue-600 bg-blue-100 px-2 rounded hover:bg-blue-200 text-xs">Edit</button>
                                <button onClick={()=>onDelete(m.id)} className="text-red-600 bg-red-100 px-2 rounded hover:bg-red-200 text-xs">Del</button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    </div>
);

const MatchEntry = ({ db, appId, userId, teams }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [scores, setScores] = useState(['', '', '']);
    
    // Stati per la selezione squadre
    const [team1Id, setTeam1Id] = useState('alpha');
    const [team2Id, setTeam2Id] = useState('beta');
    
    const [msg, setMsg] = useState('');

    const teamList = Object.values(teams); // Array per i dropdown

    const submit = async (e) => {
        e.preventDefault();
        setMsg('');
        
        if (team1Id === team2Id) { setMsg("Seleziona due squadre diverse."); return; }

        const valid = scores.filter(s => s.includes('-'));
        if (valid.length < 2) { setMsg("Inserisci almeno 2 set validi (X-Y)."); return; }
        
        const calc = calculatePoints(valid);
        
        // Determina l'ID del vincitore in base al codice (1 o 2)
        let finalWinnerId = null;
        if (calc.winnerCode === 1) finalWinnerId = team1Id;
        if (calc.winnerCode === 2) finalWinnerId = team2Id;

        await addDoc(collection(db, `artifacts/${appId}/public/data/matches`), {
            date, 
            setScores: valid,
            team1Id, // Salviamo gli ID!
            team2Id, // Salviamo gli ID!
            
            pointsT1: calc.pointsT1, 
            pointsT2: calc.pointsT2, 
            winnerId: finalWinnerId,
            
            setsT1: calc.setsT1, setsT2: calc.setsT2, 
            gamesT1: calc.gamesT1, gamesT2: calc.gamesT2,
            
            addedBy: userId, createdAt: new Date().toISOString()
        });
        
        setMsg("Partita Salvata!"); 
        setScores(['','','']);
    };

    return (
        <div className="max-w-md mx-auto bg-white p-6 rounded-xl shadow">
            <h3 className="font-bold text-xl mb-4">Nuova Partita</h3>
            <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Squadra 1</label>
                        <select className="w-full border p-2 rounded" value={team1Id} onChange={e=>setTeam1Id(e.target.value)}>
                            {teamList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Squadra 2</label>
                        <select className="w-full border p-2 rounded" value={team2Id} onChange={e=>setTeam2Id(e.target.value)}>
                            {teamList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                </div>

                <input type="date" className="w-full border p-2 rounded" value={date} onChange={e=>setDate(e.target.value)} />
                
                <div className="bg-gray-50 p-3 rounded">
                    <p className="text-xs font-bold text-gray-500 mb-2 text-center">Punteggi (Game T1 - Game T2)</p>
                    {scores.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 mb-2">
                            <span className="w-12 text-sm font-bold text-gray-500">Set {i+1}</span>
                            <input className="flex-1 border p-2 rounded text-center" placeholder="6-4" value={s} onChange={e=>{const n=[...scores];n[i]=e.target.value;setScores(n)}} />
                        </div>
                    ))}
                </div>

                <button className="w-full bg-emerald-600 text-white py-3 rounded font-bold hover:bg-emerald-700">Registra Risultato</button>
                {msg && <div className={`text-center text-sm p-2 rounded ${msg.includes('Salvata') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{msg}</div>}
            </form>
        </div>
    );
};

const EditMatchModal = ({ db, appId, match, teams, onClose }) => {
    const [date, setDate] = useState(match.date);
    const [scores, setScores] = useState([match.setScores?.[0]||'', match.setScores?.[1]||'', match.setScores?.[2]||'']);
    
    // Se il match è vecchio e non ha ID, fallback su alpha/beta
    const [t1Id, setT1Id] = useState(match.team1Id || 'alpha');
    const [t2Id, setT2Id] = useState(match.team2Id || 'beta');
    
    const teamList = Object.values(teams);

    const save = async (e) => {
        e.preventDefault();
        const valid = scores.filter(s => s.includes('-'));
        const calc = calculatePoints(valid);
        
        let finalWinnerId = null;
        if (calc.winnerCode === 1) finalWinnerId = t1Id;
        if (calc.winnerCode === 2) finalWinnerId = t2Id;

        await updateDoc(doc(db, `artifacts/${appId}/public/data/matches`, match.id), {
            date, setScores: valid,
            team1Id: t1Id, team2Id: t2Id,
            pointsT1: calc.pointsT1, pointsT2: calc.pointsT2, winnerId: finalWinnerId,
            setsT1: calc.setsT1, setsT2: calc.setsT2, gamesT1: calc.gamesT1, gamesT2: calc.gamesT2
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-md relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
                <h3 className="font-bold text-xl mb-4">Modifica Partita</h3>
                <form onSubmit={save} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                         <select className="border p-1 rounded text-sm" value={t1Id} onChange={e=>setT1Id(e.target.value)}>
                            {teamList.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                         </select>
                         <select className="border p-1 rounded text-sm" value={t2Id} onChange={e=>setT2Id(e.target.value)}>
                            {teamList.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                         </select>
                    </div>
                    <input type="date" className="w-full border p-2 rounded" value={date} onChange={e=>setDate(e.target.value)} />
                    {scores.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <span className="w-12 text-sm font-bold text-gray-500">Set {i+1}</span>
                            <input className="flex-1 border p-2 rounded text-center" value={s} onChange={e=>{const n=[...scores];n[i]=e.target.value;setScores(n)}} />
                        </div>
                    ))}
                    <button className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700">Salva Modifiche</button>
                </form>
            </div>
        </div>
    );
};

const PlanningView = ({ db, appId, userId, userName, myAvail, allAvail, reqPlayers }) => {
    const [dates, setDates] = useState(myAvail.freeDates || []);
    const toggle = (d) => setDates(prev => prev.includes(d) ? prev.filter(x=>x!==d) : [...prev, d].sort());
    const save = async () => {
        if(!db) return;
        await setDoc(doc(db, `artifacts/${appId}/public/data/availability`, userId), { userId, userName, freeDates: dates });
        alert("Salvato!");
    };
    const commonDates = useMemo(() => {
        const counts = {};
        allAvail.forEach(u => u.freeDates?.forEach(d => counts[d] = (counts[d]||0)+1));
        return Object.keys(counts).filter(d => counts[d] >= reqPlayers).sort();
    }, [allAvail, reqPlayers]);

    return (
        <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-xl shadow">
                <h3 className="font-bold mb-4">Le tue date</h3>
                <input type="date" className="w-full border p-2 rounded mb-4" min={new Date().toISOString().split('T')[0]} onChange={(e)=>toggle(e.target.value)} />
                <div className="flex flex-wrap gap-2 mb-4">
                    {dates.map(d => <span key={d} onClick={()=>toggle(d)} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm cursor-pointer hover:bg-red-100 hover:text-red-800">{d} ✕</span>)}
                </div>
                <button onClick={save} className="w-full bg-emerald-600 text-white py-2 rounded">Salva</button>
            </div>
            <div className="bg-white p-6 rounded-xl shadow">
                <h3 className="font-bold mb-4 text-emerald-700">Date Comuni ({reqPlayers}/{reqPlayers})</h3>
                <div className="flex flex-wrap gap-2">
                    {commonDates.length===0 && <span className="text-gray-400 text-sm">Nessuna data trovata.</span>}
                    {commonDates.map(d => <div key={d} className="bg-yellow-300 text-yellow-900 font-bold px-4 py-2 rounded shadow">{d}</div>)}
                </div>
                <div className="mt-6 pt-4 border-t">
                     {allAvail.map(u => <div key={u.id} className="text-xs mb-1 flex justify-between"><span>{u.userName}</span><span className="text-gray-500">{u.freeDates?.length||0} date</span></div>)}
                </div>
            </div>
        </div>
    );
};

const ConfigView = ({ db, appId, config }) => {
    const [c, setC] = useState(config);
    useEffect(() => setC(config), [config]);
    const save = async () => { if(db) await setDoc(doc(db, `artifacts/${appId}/public/data/config`, 'playerNames'), c); alert("Salvato!"); };

    return (
        <div className="max-w-4xl mx-auto bg-white p-6 rounded-xl shadow space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="font-bold text-xl">Configurazione</h3>
                <button onClick={save} className="bg-blue-600 text-white py-2 px-6 rounded font-bold hover:bg-blue-700">Salva</button>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
                <ConfigTeamCard color="emerald" teamId="Alpha" p1="playerA" p2="playerB" c={c} setC={setC} />
                <ConfigTeamCard color="indigo" teamId="Beta" p1="playerC" p2="playerD" c={c} setC={setC} />
                <ConfigTeamCard color="amber" teamId="Gamma" p1="playerE" p2="playerF" c={c} setC={setC} />
            </div>
            <div className="bg-gray-50 p-4 rounded border">
                <label className="block text-sm font-bold mb-1">Minimo giocatori per Planning</label>
                <input type="number" className="border p-1 rounded w-20" value={c.requiredPlayers} onChange={e=>setC({...c, requiredPlayers:parseInt(e.target.value)})} min="2" max="6"/>
            </div>
        </div>
    );
};

const ConfigTeamCard = ({ color, teamId, p1, p2, c, setC }) => (
    <div className={`p-3 bg-${color}-50 border border-${color}-200 rounded`}>
        <h4 className={`font-bold text-${color}-800 mb-2`}>Team {teamId}</h4>
        <input className="w-full mb-1 p-1 text-sm border rounded" value={c[`team${teamId}Name`]} onChange={e=>setC({...c, [`team${teamId}Name`]:e.target.value})} placeholder="Nome Team" />
        <input className="w-full mb-3 p-1 text-xs border rounded" value={c[`team${teamId}Logo`]} onChange={e=>setC({...c, [`team${teamId}Logo`]:e.target.value})} placeholder="URL Logo" />
        
        <input className="w-full mb-1 p-1 text-sm border rounded" value={c[p1]} onChange={e=>setC({...c, [p1]:e.target.value})} placeholder="Giocatore 1" />
        <input className="w-full mb-3 p-1 text-xs border rounded" value={c[`${p1}Photo`]} onChange={e=>setC({...c, [`${p1}Photo`]:e.target.value})} placeholder="URL Foto" />
        
        <input className="w-full mb-1 p-1 text-sm border rounded" value={c[p2]} onChange={e=>setC({...c, [p2]:e.target.value})} placeholder="Giocatore 2" />
        <input className="w-full mb-1 p-1 text-xs border rounded" value={c[`${p2}Photo`]} onChange={e=>setC({...c, [`${p2}Photo`]:e.target.value})} placeholder="URL Foto" />
    </div>
);

const SetupModal = ({ isOpen, message, val, setVal, onSave }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">Benvenuto</h2>
                <p className="mb-4 text-sm">{message}</p>
                <input className="w-full border p-2 rounded mb-4" value={val} onChange={e=>setVal(e.target.value)} placeholder="Il tuo nome" />
                <button onClick={onSave} className="w-full bg-emerald-600 text-white py-2 rounded hover:bg-emerald-700">Salva</button>
            </div>
        </div>
    );
};

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-xl w-full max-w-sm">
                <h3 className="text-lg font-bold text-red-600 mb-2">{title}</h3>
                <p className="mb-4 text-sm">{message}</p>
                <div className="flex justify-end gap-2">
                    <button onClick={onCancel} className="px-4 py-2 bg-gray-200 rounded">Annulla</button>
                    <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded">Conferma</button>
                </div>
            </div>
        </div>
    );
};

export default PadelApp;
