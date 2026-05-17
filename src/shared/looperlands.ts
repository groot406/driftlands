export interface LooperlandsNftToken {
  tokenId: string;
  tokenHash?: string | null;
}

export interface LooperlandsAsset {
  id: string;
  nftId: string;
  name: string;
  assetType: string;
  token: LooperlandsNftToken;
  freeToPlay?: boolean;
}

export interface LooperlandsHeroSelection {
  id: string;
  nftId: string;
  name: string;
  tokenId: string;
  tokenHash?: string | null;
  spriteUrl: string;
  fallbackSpriteUrl?: string | null;
}

export interface LooperlandsJoinAuth {
  walletAddress: string;
  chainId: number;
  token: string;
  heroes: LooperlandsHeroSelection[];
}

export function normalizeWalletAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function buildLooperlandsPlayerId(walletAddress: string, chainId: number): string {
  return `wallet:${chainId}:${normalizeWalletAddress(walletAddress)}`;
}

export function buildLooperSpriteCdnUrl(tokenId: string): string {
  const normalizedTokenId = tokenId.replace(/^0x/i, '');
  return `https://cdn.jsdelivr.net/gh/balkshamster/looperlands@main/client/img/1/NFT_${normalizedTokenId}.png`;
}

export function buildLooperSpriteSpacesUrl(tokenHash?: string | null): string | null {
  if (!tokenHash) {
    return null;
  }

  return `https://looperlands.sfo3.cdn.digitaloceanspaces.com/assets/looper/1/${tokenHash}.png`;
}

export function buildLooperSpriteUrl(token: LooperlandsNftToken): string {
  return buildLooperSpriteSpacesUrl(token.tokenHash) ?? buildLooperSpriteCdnUrl(token.tokenId);
}

export function buildLooperSpriteFallbackUrl(token: LooperlandsNftToken): string | null {
  return token.tokenHash ? buildLooperSpriteCdnUrl(token.tokenId) : null;
}

export function toLooperHeroSelection(asset: LooperlandsAsset): LooperlandsHeroSelection {
  return {
    id: asset.id,
    nftId: asset.nftId,
    name: asset.name,
    tokenId: asset.token.tokenId,
    tokenHash: asset.token.tokenHash ?? null,
    spriteUrl: buildLooperSpriteUrl(asset.token),
    fallbackSpriteUrl: buildLooperSpriteFallbackUrl(asset.token),
  };
}

export function isLooperAsset(asset: Pick<LooperlandsAsset, 'assetType'>): boolean {
  return asset.assetType === 'looper';
}
