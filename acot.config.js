module.exports = {
  presets: ["@acot/wcag"],
  connection: {
    command: "zola serve",
  },
  origin: "http://localhost:1111",
  paths: ["/"],
  rules: {
    "@acot/wcag/page-has-title": "error",
    "@acot/wcag/img-has-name": "error",
  },
};
