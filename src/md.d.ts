// Project declarations are imported as text via a wrangler Text rule.
declare module "*.md" {
  const content: string;
  export default content;
}
