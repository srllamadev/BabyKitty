import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const config = createConfig({
  chains: [
    {
      id: 43113,
      name: 'Avalanche Fuji',
      nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
      rpcUrls: { default: { http: ['https://api.avax-test.network/ext/bc/C/rpc'] } },
      blockExplorers: { default: { name: 'Snowtrace', url: 'https://testnet.snowtrace.io' } },
    },
    {
      id: 31337,
      name: 'Hardhat Local',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
    },
  ],
  transports: {
    43113: http(),
    31337: http(),
  },
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
