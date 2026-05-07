(function () {
  var SESSION_KEY = "studybuddy_site_unlocked";
  var REQUIRED_PASSWORD = "316497";

  if (sessionStorage.getItem(SESSION_KEY) === "yes") {
    return;
  }

  var attempts = 0;
  while (attempts < 5) {
    var entered = window.prompt("Enter website password:", "");

    if (entered === REQUIRED_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "yes");
      return;
    }

    attempts += 1;

    if (entered === null) {
      break;
    }

    window.alert("Wrong password.");
  }

  document.documentElement.innerHTML = "";
})();
