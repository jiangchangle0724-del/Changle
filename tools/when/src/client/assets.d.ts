// A picture a page imports (`import picture from "./art/x.webp"`): the build puts the file beside
// the scripts under a name that carries a hash of its contents, and the import is its address.
declare module "*.webp" {
  const address: string;
  export default address;
}
