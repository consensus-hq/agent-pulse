const { ethers } = require('ethers');
const fs = require('fs');

const RPC_URL = 'http://127.0.0.1:8545';
const FUNDER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TOKEN_ADDR = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
const REGISTRY_ADDR = '0xe98126c33284b48C5C5a1836A3bDAcBBF7e8F12b';

const provider = new ethers.JsonRpcProvider(RPC_URL);
const funder = new ethers.Wallet(FUNDER_KEY, provider);

// ERC20 ABI for mint and approve
const ERC20_ABI = [
  'function mint(address to, uint256 amount) external',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)'
];

const wallets = [
  { label: 'qa-wallet-01', address: '0x6481C463e88Ef23c4982b9587E51C693db0F1983', private_key: '0xa5082b16951632ae4be876d663acb9153eb7d06560c736778b843bb0ac554896' },
  { label: 'qa-wallet-02', address: '0x27814fF5b0127f0bF44F4c806604b91cD327A363', private_key: '0xc3cb8903e665d3ea0dd5bbe84315462fb2e8fcafbd98fcac7eda032b4d7bbb2c' },
  { label: 'qa-wallet-03', address: '0x2BCf33e89923590ac994663df71754fE5308B234', private_key: '0x9c052d9761289e39a8cadc115a0b94248135440080319c2084a9adfb6ea6f35c' },
  { label: 'qa-wallet-04', address: '0xad01A5d5C674F5135949bDe7D6Cd9200EEe54C6a', private_key: '0x7b635162952dc7e7a9938b8e2ec556850da9a5fdbe6e3ab3e75de525851bfd96' },
  { label: 'qa-wallet-05', address: '0xE4B47DCc564d64AC2cF1DF678edCEEdb22AE1b9F', private_key: '0x61e01cdc4a6b34d6890d18a1c7ad07de9e5f9f532676a4bddac447983de77359' },
  { label: 'qa-wallet-06', address: '0x5C0068b19e3134DE08b3BCcb48847c16395E2279', private_key: '0x2b2a19e265f27f7f326d1e9e33e737f031182253e42e8a478523c196af6c9fe2' },
  { label: 'qa-wallet-07', address: '0x5ce8df3106C9E1ef9a95587cdBFb526cDeF2F637', private_key: '0xd4aa6b806ab852ba4b26e6d691e0b9c290ea28d8d9e7b5072b2dc3c6136d7a8c' },
  { label: 'qa-wallet-08', address: '0xEF3548A7040f05578C148B48A1bF8295436a9319', private_key: '0xd5ef650e1a5f65e1b397d88bbe5c00e4354ffe841e86eecaf1291a2c531a74ea' },
  { label: 'qa-wallet-09', address: '0x4a6214e55485C075dA94d1F01578267FBbdFFA59', private_key: '0x14e0ee0d31e1bb0026033248bce85ae549337c89c63c81ece2d5ec44538b8191' },
  { label: 'qa-wallet-10', address: '0x3C4642812ef50f89d0faf941E9f236A9D312cB96', private_key: '0x29ab751775fec031c3d3ce68a33cf42448171b34c6a594d058044dc69b812faa' }
];

const tokenContract = new ethers.Contract(TOKEN_ADDR, ERC20_ABI, funder);

async function fundWallets() {
  const fundingTxs = [];
  let nonce = await provider.getTransactionCount(funder.address, 'latest');
  
  for (const wallet of wallets) {
    console.log(`Funding ${wallet.label} (${wallet.address})...`);
    
    // Send 100 ETH
    const ethTx = await funder.sendTransaction({
      to: wallet.address,
      value: ethers.parseEther('100'),
      nonce: nonce++
    });
    console.log(`  ETH tx sent: ${ethTx.hash}`);
    await ethTx.wait();
    fundingTxs.push({ type: 'eth', wallet: wallet.address, label: wallet.label, tx: ethTx.hash });
    
    // Mint 100,000 PULSE tokens
    const mintAmount = ethers.parseEther('100000');
    const mintTx = await tokenContract.mint(wallet.address, mintAmount, { nonce: nonce++ });
    console.log(`  Mint tx sent: ${mintTx.hash}`);
    await mintTx.wait();
    fundingTxs.push({ type: 'mint', wallet: wallet.address, label: wallet.label, tx: mintTx.hash });
    
    // Approve PulseRegistry to spend PULSE tokens (max uint256)
    const maxUint256 = ethers.MaxUint256;
    const approveTx = await tokenContract.approve(REGISTRY_ADDR, maxUint256, { nonce: nonce++ });
    console.log(`  Approve tx sent: ${approveTx.hash}`);
    await approveTx.wait();
    fundingTxs.push({ type: 'approve', wallet: wallet.address, label: wallet.label, tx: approveTx.hash });
    
    console.log(`  ${wallet.label} funded successfully!`);
  }
  
  // Save funding transactions
  fs.writeFileSync('/opt/fundbot/work/workspace-connie/REPORTS/qa/swarm-state/funding-txs.json', JSON.stringify(fundingTxs, null, 2));
  console.log('\nAll wallets funded successfully!');
}

fundWallets().catch(console.error);
