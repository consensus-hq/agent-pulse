const { ethers } = require('ethers');
const fs = require('fs');

// Generate 10 fresh wallets
const wallets = [];
for (let i = 1; i <= 10; i++) {
  const wallet = ethers.Wallet.createRandom();
  wallets.push({
    label: `qa-wallet-${String(i).padStart(2, '0')}`,
    address: wallet.address,
    private_key: wallet.privateKey
  });
}

console.log(JSON.stringify(wallets, null, 2));
