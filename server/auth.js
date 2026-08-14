function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "No autenticado" });
  }
  return res.redirect("/login");
}

function login(req, res) {
  const { password } = req.body || {};
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return res.status(500).send("El servidor no tiene configurada la variable APP_PASSWORD.");
  }
  if (password === expected) {
    req.session.authenticated = true;
    return res.redirect("/");
  }
  return res.redirect("/login?error=1");
}

function logout(req, res) {
  req.session.destroy(() => res.redirect("/login"));
}

module.exports = { requireAuth, login, logout };
