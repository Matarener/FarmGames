components {
  id: "main"
  component: "/main/main.script"
}
components {
  id: "hud"
  component: "/gui/hud.gui"
}
components {
  id: "map"
  component: "/map/farm.tilemap"
  position {
    z: -500.0
  }
}
embedded_components {
  id: "ground_f"
  type: "factory"
  data: "prototype: \"/main/ground.go\"\n"
  ""
}
embedded_components {
  id: "world_f"
  type: "factory"
  data: "prototype: \"/main/world.go\"\n"
  ""
}
