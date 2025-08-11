'use client';

import { BrokerId } from '@/types/Broker';


interface BrokerCardProps {
  id: BrokerId;
  name: string;
  description: string;
  logo: string;
  connected: boolean | null;
  isActive: boolean;
  onSetActive: (brokerId: BrokerId) => void;
  onConnect: (brokerId: BrokerId) => void;
  onDisconnect: (brokerId: BrokerId) => void;
}

export default function BrokerCard({
  id,
  name,
  description,
  logo,
  connected,
  isActive,
  onSetActive,
  onConnect,
  onDisconnect,
}: BrokerCardProps) {
  return (
    <div
      className={`rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-xl border transition-all duration-300 
        ${
          isActive
            ? 'border-green-400/50 hover:border-green-400'
            : 'border-purple-400/20 hover:border-purple-400/40'
        }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between w-full mb-3">
        <img src={logo} alt={name} className="h-10" />
        <span
          className={`w-3 h-3 rounded-full transition-all ${
            connected === null
              ? 'bg-gray-400 animate-pulse'
              : connected
              ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'
              : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
          }`}
        />
      </div>

      {/* Name & Description */}
      <p className="font-semibold text-white">{name}</p>
      <p className="text-sm text-neutral-400 mb-4">{description}</p>

      {/* Action Buttons */}
      {connected === null ? (
        // ✅ Loading state
        <button
          disabled
          className="px-4 py-2 rounded-md text-sm font-medium bg-gray-600 text-gray-400 cursor-not-allowed"
        >
          Checking...
        </button>
      ) : connected ? (
        <div className="flex gap-2">
          <button
            onClick={() => onSetActive(id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-300
              ${
                isActive
                  ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-black hover:opacity-90'
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90'
              }`}
          >
            {isActive ? 'Active' : 'Set Active'}
          </button>
          <button
            onClick={() => onDisconnect(id)}
            className="px-4 py-2 rounded-md text-sm font-medium bg-gradient-to-r from-red-500 to-rose-600 text-white hover:opacity-90 transition-all duration-300"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={() => onConnect(id)}
          className="px-4 py-2 rounded-md text-sm font-medium bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:opacity-90 transition-all duration-300"
        >
          Connect
        </button>
      )}
    </div>
  );
}
