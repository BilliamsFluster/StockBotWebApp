// components/BrokerCard.tsx
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

export default function BrokerCard(props: BrokerCardProps) {
  const {
    id,
    name,
    description,
    logo,
    connected,
    isActive,
    onSetActive,
    onConnect,
    onDisconnect,
  } = props;

  return (
    <div
      className={`border rounded-lg p-4 shadow-md flex flex-col items-start ${
        isActive ? 'border-green-500' : 'border-gray-300'
      }`}
    >
      <div className="flex items-center justify-between w-full mb-3">
        <img src={logo} alt={name} className="h-10" />
        <span
          className={`w-3 h-3 rounded-full ${
            connected === null
              ? 'bg-gray-400 animate-pulse'
              : connected
              ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]'
              : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
          }`}
        />
      </div>

      <p className="font-semibold">{name}</p>
      <p className="text-sm text-gray-500 mb-4">{description}</p>

      {connected ? (
        <div className="flex gap-2">
          <button
            onClick={() => onSetActive(id)}
            className={`px-4 py-2 rounded-md ${
              isActive
                ? 'bg-green-500 text-white'
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            {isActive ? 'Active' : 'Set Active'}
          </button>
          <button
            onClick={() => onDisconnect(id)}
            className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={() => onConnect(id)}
          className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
        >
          Connect
        </button>
      )}
    </div>
  );
}
