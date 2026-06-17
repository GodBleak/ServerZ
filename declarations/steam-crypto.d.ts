declare module "@doctormckay/steam-crypto" {
  const SteamCrypto: {
    symmetricDecryptECB(data: Buffer, key: Buffer): Buffer;
    symmetricDecrypt(data: Buffer, key: Buffer): Buffer;
  };
  export default SteamCrypto;
}
