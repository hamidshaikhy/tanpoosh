import { beforeEach, describe, expect, it } from "vitest";
import { decodeOutfit, encodeOutfit, useStudio, type Outfit } from "./store";

beforeEach(() => {
  useStudio.getState().replace({}, { record: false });
});
const look: Outfit = { top: { slug: "basic-tee", color: "ivory", size: "M" }, bottom: { slug: "tailored-trousers", color: "black", size: null } };

describe("studio selections", () => {
  it("reads legacy five-piece links without losing the last eyewear entry", () => {
    const parsed = decodeOutfit("top.basic-tee.ivory.M~outerwear.navy-blazer.navy.M~bottom.tailored-trousers.black.32~shoes.derby-shoes.black.42~accessory.tortoise-sunglasses.tortoise.ONE");
    expect(parsed.outerwear).toBeUndefined();
    expect(parsed.accessory?.slug).toBe("tortoise-sunglasses");
    expect(Object.keys(parsed)).toHaveLength(4);
  });
  it("removes retired coats from restored outfits and history", () => {
    const s = useStudio.getState();
    s.replace({...look,outerwear:{slug:"navy-blazer",color:"navy",size:"M"}}, {record:false,savedLookId:"old-look"});
    expect(useStudio.getState().savedLookId).toBeNull();
    expect(useStudio.getState().outfit).toEqual(look);
    s.update("top", {color:"black"});
    s.undo();
    expect(useStudio.getState().outfit).toEqual(look);
    s.set("outerwear", {slug:"navy-blazer",color:"navy",size:"M"});
    expect(useStudio.getState().outfit).toEqual(look);
  });
  it("round-trips public identifiers without private customer data", () => expect(decodeOutfit(encodeOutfit(look))).toEqual(look));
  it("drops malicious/unknown slots, slugs and size codes", () => {
    expect(decodeOutfit("user.alice.black.M~top.<script>.black.M~top.basic-tee.black.<x>"))
      .toEqual({ top: { slug: "basic-tee", color: "black", size: null } });
  });
  it("undoes and redoes edits while preserving other slots", () => {
    const s = useStudio.getState();
    s.replace(look);
    s.update("top", { color: "black" });
    s.undo();
    expect(useStudio.getState().outfit).toEqual(look);
    s.redo();
    expect(useStudio.getState().outfit.top?.color).toBe("black");
    expect(useStudio.getState().outfit.bottom).toEqual(look.bottom);
    s.undo();
    s.update("top", { size: "L" });
    expect(useStudio.getState().future).toEqual([]);
  });
  it("invalidates a saved-look identity after undo or redo", () => {
    const s = useStudio.getState();
    s.replace(look);
    s.update("top", { size: "L" });
    useStudio.setState({ savedLookId: "saved-look-id" });
    s.undo();
    expect(useStudio.getState().savedLookId).toBeNull();
  });
  it("bounds outfit history", () => {
    const s = useStudio.getState();
    s.replace(look);
    for (let i = 0; i < 40; i++) s.update("top", { size: String(i) });
    expect(useStudio.getState().past.length).toBe(30);
  });
});
