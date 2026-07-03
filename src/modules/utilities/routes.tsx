import { ToolNav } from "./ToolNav";
import { JsonTool } from "./JsonTool";
import { JwtTool } from "./JwtTool";
import { Base64Tool } from "./Base64Tool";
import { UuidTool } from "./UuidTool";
import { HashTool } from "./HashTool";
import { UrlTool } from "./UrlTool";
import { TimestampTool } from "./TimestampTool";

function withNav(id: string, Tool: React.ComponentType) {
  return function NavWrapped() {
    return (
      <ToolNav activeId={id}>
        <Tool />
      </ToolNav>
    );
  };
}

export const JsonRoute = withNav("json", JsonTool);
export const JwtRoute = withNav("jwt", JwtTool);
export const Base64Route = withNav("base64", Base64Tool);
export const UuidRoute = withNav("uuid", UuidTool);
export const HashRoute = withNav("hash", HashTool);
export const UrlRoute = withNav("url", UrlTool);
export const TimestampRoute = withNav("timestamp", TimestampTool);
