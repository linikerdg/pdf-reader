/**
 * O Android entrega o PDF do "Abrir com" como um link content:// ou file://,
 * que não corresponde a nenhuma rota. Aqui ele é redirecionado para /open,
 * que importa o arquivo e abre o leitor. Vale tanto para o app fechado quanto
 * para o app já aberto.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (/^(content|file):\/\//i.test(path)) {
      return `/open?uri=${encodeURIComponent(path)}`;
    }
    return path;
  } catch {
    return '/';
  }
}
