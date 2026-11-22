import { redirect } from "next/navigation";

// Mi Nodo now lives in Perfil, under "Nodo y Privacidad"; old links land there.
export default function NodoPage() {
  redirect("/perfil");
}
