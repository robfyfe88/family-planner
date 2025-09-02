import { fetchAnnualData } from "../app/annual/actions";
import FamilyToolsClient from "./FamilyToolsClient";

export default async function FamilyToolsServer() {
  const initialAnnual = await fetchAnnualData(); 
  return <FamilyToolsClient initialAnnual={initialAnnual} />;
}
