// frontend/src/pages/CrashPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { MeResponse } from '../api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface CrashPageProps {
  me: MeResponse | null;
}

export const CrashPage: React.FC<CrashPageProps> = ({ me }) => {
  const [phase, setPhase] = useState('connecting');
  const [multiplier, setMultiplier] = useState(1.00);
  const [history, setHistory] = useState<{ time: number, value: number }[]>([]);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Die WebSocket-URL muss auf deine Domain zeigen, aber mit wss:// (für https)
    const wsUrl = `wss://${window.location.host}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log("WebSocket connected");
      setPhase('connected');
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'gameState':
          setPhase(data.phase);
          setMultiplier(data.multiplier);
          break;
        case 'newRound':
          setPhase(data.phase);
          setHistory([]); // Graphen zurücksetzen
          setMultiplier(1.00);
          break;
        case 'roundStart':
          setPhase(data.phase);
          break;
        case 'multiplierUpdate':
          setMultiplier(data.multiplier);
          setHistory(prev => [...prev, { time: prev.length, value: data.multiplier }]);
          break;
        case 'crash':
          setPhase('crashed');
          setMultiplier(data.multiplier);
          break;
      }
    };

    ws.current.onclose = () => {
      console.log("WebSocket disconnected");
      setPhase('disconnected');
    };

    return () => {
      ws.current?.close();
    };
  }, []);

  const getStatusMessage = () => {
    switch (phase) {
      case 'connecting': return 'Verbinde mit dem Server...';
      case 'connected':
      case 'waiting': return 'Warte auf die nächste Runde...';
      case 'betting': return 'Einsätze platzieren! Runde startet bald...';
      case 'running': return 'Runde läuft!';
      case 'crashed': return `CRASHED @ ${multiplier.toFixed(2)}x`;
      case 'disconnected': return 'Verbindung verloren. Bitte Seite neu laden.';
      default: return '';
    }
  };

  return (
    <div>
      <h2>🚀 Bier-Crash</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '24px' }}>
        {/* Linke Spalte: Steuerung */}
        <div>
          <h4>Dein Einsatz</h4>
          <input type="number" placeholder="100" style={{ width: '100%', padding: '8px', background: '#0b0b10', border: '1px solid #555', color: 'white', borderRadius: '4px' }} />
          <button style={{ width: '100%', padding: '12px', marginTop: '16px', background: 'limegreen', border: 'none', borderRadius: '4px', color: 'white', fontWeight: 'bold' }}>
            Einsatz platzieren
          </button>
          <button style={{ width: '100%', padding: '12px', marginTop: '8px', background: 'dodgerblue', border: 'none', borderRadius: '4px', color: 'white', fontWeight: 'bold' }}>
            CASHOUT
          </button>
        </div>

        {/* Rechte Spalte: Graph und Multiplikator */}
        <div style={{ background: '#0b0b10', padding: '16px', borderRadius: '8px', position: 'relative', height: '400px' }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', zIndex: 1 }}>
            <h1 style={{ fontSize: '4rem', margin: 0, color: phase === 'crashed' ? 'salmon' : 'white' }}>
              {multiplier.toFixed(2)}x
            </h1>
            <p style={{ margin: 0, fontSize: '1.2rem' }}>{getStatusMessage()}</p>
          </div>
          <ResponsiveContainer>
            <LineChart data={history}>
              <XAxis type="number" dataKey="time" hide />
              <YAxis type="number" domain={['auto', 'auto']} hide />
              <Tooltip content={() => null} />
              <Line type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={4} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};