declare module "*.mp3" {
  const asset: number; // Metro trả về module id (number)
  export default asset;
}
declare module "*.wav" {
  const asset: number;
  export default asset;
}

declare module "*.ogg" {
  const asset: number;
  export default asset;
}
