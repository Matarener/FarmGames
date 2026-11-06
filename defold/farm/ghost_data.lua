-- Сгенерировано defold/tools/build_assets.py из src/game/ghost.js (makeGhostData)
-- Пустое вложение (null в JS) записано как false.
return {
  bones = {
    {
      name = "root"
    },
    {
      name = "float",
      parent = "root",
      y = -6
    },
    {
      name = "body",
      parent = "float"
    },
    {
      name = "hat",
      parent = "body",
      x = 0.5,
      y = -22,
      rotation = -6
    },
    {
      name = "armB",
      parent = "body",
      x = 6.5,
      y = -10
    },
    {
      name = "foreB",
      parent = "armB",
      y = 4
    },
    {
      name = "armF",
      parent = "body",
      x = -6.5,
      y = -8
    },
    {
      name = "foreF",
      parent = "armF",
      y = 4
    }
  },
  slots = {
    {
      name = "foreB",
      bone = "foreB",
      attachment = "hand"
    },
    {
      name = "body",
      bone = "body",
      attachment = "b0"
    },
    {
      name = "hat",
      bone = "hat",
      attachment = "hat"
    },
    {
      name = "tool",
      bone = "foreF",
      attachment = false
    },
    {
      name = "foreF",
      bone = "foreF",
      attachment = "hand"
    }
  },
  skins = {
    default = {
      foreB = {
        hand = {
          x = 0,
          y = 3.4,
          rotation = 0,
          sprite = "g_default_foreB_hand"
        }
      },
      foreF = {
        hand = {
          x = 0,
          y = 3.4,
          rotation = 0,
          sprite = "g_default_foreF_hand"
        }
      },
      body = {
        b0 = {
          x = 0,
          y = 0,
          rotation = 0,
          sprite = "g_default_body_b0"
        },
        b1 = {
          x = 0,
          y = 0,
          rotation = 0,
          sprite = "g_default_body_b1"
        },
        b2 = {
          x = 0,
          y = 0,
          rotation = 0,
          sprite = "g_default_body_b2"
        }
      },
      hat = {
        hat = {
          x = 0,
          y = 0,
          rotation = 0,
          sprite = "g_default_hat_hat"
        }
      },
      tool = {
        axe = {
          x = 0,
          y = 3.4,
          rotation = 0,
          sprite = "g_default_tool_axe"
        },
        pickaxe = {
          x = 0,
          y = 3.4,
          rotation = 0,
          sprite = "g_default_tool_pickaxe"
        },
        hoe = {
          x = 0,
          y = 3.4,
          rotation = 0,
          sprite = "g_default_tool_hoe"
        },
        can = {
          x = 0,
          y = 3.6,
          rotation = 0,
          sprite = "g_default_tool_can"
        },
        seedbag = {
          x = 0,
          y = 3.4,
          rotation = 0,
          sprite = "g_default_tool_seedbag"
        },
        rod = {
          x = 0,
          y = 3.4,
          rotation = 0,
          sprite = "g_default_tool_rod"
        }
      }
    },
    back = {
      foreB = {
        hand = {
          x = 0,
          y = 3.4,
          rotation = 0,
          sprite = "g_back_foreB_hand"
        }
      },
      foreF = {
        hand = {
          x = 0,
          y = 3.4,
          rotation = 0,
          sprite = "g_back_foreF_hand"
        }
      },
      body = {
        b0 = {
          x = 0,
          y = 0,
          rotation = 0,
          sprite = "g_back_body_b0"
        },
        b1 = {
          x = 0,
          y = 0,
          rotation = 0,
          sprite = "g_back_body_b1"
        },
        b2 = {
          x = 0,
          y = 0,
          rotation = 0,
          sprite = "g_back_body_b2"
        }
      }
    }
  },
  drawOrders = {
    back = {"tool", "foreF", "body", "hat", "foreB"}
  },
  animations = {
    idle = {
      duration = 1.8,
      slots = {
        body = {
          {0, "b0"},
          {0.3, "b1"},
          {0.6, "b2"},
          {0.9, "b0"},
          {1.2, "b1"},
          {1.5, "b2"}
        }
      },
      bones = {
        float = {
          translate = {
            {0, 0, 0, 2},
            {0.9, 0, -2.4, 2},
            {1.8, 0, 0}
          }
        },
        body = {
          scale = {
            {0, 1.03, 0.97, 2},
            {0.9, 0.98, 1.03, 2},
            {1.8, 1.03, 0.97}
          }
        },
        hat = {
          rotate = {
            {0, 0, 2},
            {1, -4, 2},
            {1.8, 0}
          }
        },
        armF = {
          rotate = {
            {0, 24, 2},
            {1, 34, 2},
            {1.8, 24}
          }
        },
        armB = {
          rotate = {
            {0, -26, 2},
            {1, -38, 2},
            {1.8, -26}
          }
        }
      }
    },
    walk = {
      duration = 0.56,
      slots = {
        body = {
          {0, "b0"},
          {0.18666666666666668, "b1"},
          {0.37333333333333335, "b2"}
        }
      },
      bones = {
        float = {
          translate = {
            {0, 0, -0.6, 2},
            {0.28, 0, -2, 2},
            {0.56, 0, -0.6}
          }
        },
        body = {
          rotate = {
            {0, 9}
          },
          scale = {
            {0, 1.04, 0.96, 2},
            {0.28, 0.97, 1.04, 2},
            {0.56, 1.04, 0.96}
          }
        },
        hat = {
          rotate = {
            {0, -8, 2},
            {0.28, -4, 2},
            {0.56, -8}
          }
        },
        armF = {
          rotate = {
            {0, 48, 2},
            {0.28, 60, 2},
            {0.56, 48}
          }
        },
        armB = {
          rotate = {
            {0, 20, 2},
            {0.28, 32, 2},
            {0.56, 20}
          }
        }
      }
    },
    swing = {
      duration = 0.72,
      events = {
        {0.44, "hit"}
      },
      slots = {
        body = {
          {0, "b0"},
          {0.18, "b1"},
          {0.36, "b2"},
          {0.54, "b0"}
        }
      },
      bones = {
        float = {
          translate = {
            {0, 0, 0, 2},
            {0.3, 0, -2.5, 3},
            {0.44, 0, 2.5, 2},
            {0.72, 0, 0}
          }
        },
        body = {
          rotate = {
            {0, 2, 2},
            {0.3, -10, 3},
            {0.44, 12, 2},
            {0.72, 2}
          },
          scale = {
            {0, 1, 1, 2},
            {0.3, 0.9, 1.12, 3},
            {0.44, 1.16, 0.84, 4},
            {0.58, 0.97, 1.04, 2},
            {0.72, 1, 1}
          }
        },
        hat = {
          rotate = {
            {0, 0, 2},
            {0.3, 6, 3},
            {0.44, -10, 2},
            {0.72, 0}
          }
        },
        armF = {
          rotate = {
            {0, -40, 2},
            {0.3, -190, 3},
            {0.44, -75, 2},
            {0.72, -40}
          }
        },
        foreF = {
          rotate = {
            {0, -10, 2},
            {0.3, -20, 3},
            {0.44, 0, 2},
            {0.72, -10}
          }
        },
        armB = {
          rotate = {
            {0, -50, 2},
            {0.3, -180, 3},
            {0.44, -70, 2},
            {0.72, -50}
          }
        }
      }
    },
    water = {
      duration = 1.1,
      events = {
        {0.84, "hit"}
      },
      slots = {
        body = {
          {0, "b0"},
          {0.18333333333333335, "b1"},
          {0.3666666666666667, "b2"},
          {0.55, "b0"},
          {0.7333333333333334, "b1"},
          {0.9166666666666666, "b2"}
        }
      },
      bones = {
        float = {
          translate = {
            {0, 0, 0, 2},
            {0.25, 0, -1.5, 2},
            {0.85, 0, -1.5, 2},
            {1.1, 0, 0}
          }
        },
        body = {
          rotate = {
            {0, 0, 2},
            {0.25, 8, 2},
            {0.85, 8, 2},
            {1.1, 0}
          },
          scale = {
            {0, 1, 1, 2},
            {0.45, 1.05, 0.95, 2},
            {0.75, 1.05, 0.95, 2},
            {1.1, 1, 1}
          }
        },
        hat = {
          rotate = {
            {0, 0, 2},
            {0.45, -6, 2},
            {0.85, -6, 2},
            {1.1, 0}
          }
        },
        armF = {
          rotate = {
            {0, -30, 2},
            {0.25, -68, 2},
            {0.85, -68, 2},
            {1.1, -30}
          }
        },
        foreF = {
          rotate = {
            {0, 0, 2},
            {0.25, -6, 2},
            {0.45, 38, 2},
            {0.75, 38, 2},
            {0.9, -6, 2},
            {1.1, 0}
          }
        },
        armB = {
          rotate = {
            {0, -20, 2},
            {0.5, -30, 2},
            {1.1, -20}
          }
        }
      }
    },
    fish = {
      duration = 2.5,
      events = {
        {2.3, "hit"}
      },
      slots = {
        body = {
          {0, "b0"},
          {0.20833333333333334, "b1"},
          {0.4166666666666667, "b2"},
          {0.625, "b0"},
          {0.8333333333333334, "b1"},
          {1.0416666666666667, "b2"},
          {1.25, "b0"},
          {1.4583333333333333, "b1"},
          {1.6666666666666667, "b2"},
          {1.875, "b0"},
          {2.0833333333333335, "b1"},
          {2.2916666666666665, "b2"}
        }
      },
      bones = {
        float = {
          translate = {
            {0, 0, 0, 2},
            {0.2, 0, -2, 2},
            {0.42, 0, 1, 2},
            {0.6, 0, 0, 2},
            {1.3, 0, -1.2, 2},
            {2, 0, 0, 2},
            {2.12, 0, -3, 2},
            {2.5, 0, 0}
          }
        },
        body = {
          rotate = {
            {0, 0, 2},
            {0.2, -8, 2},
            {0.42, 10, 2},
            {0.7, 4, 2},
            {2, 4, 2},
            {2.12, -8, 2},
            {2.5, 0}
          },
          scale = {
            {0, 1, 1, 2},
            {0.2, 0.94, 1.08, 2},
            {0.42, 1.1, 0.9, 2},
            {0.65, 1, 1, 2},
            {2.12, 0.92, 1.1, 2},
            {2.3, 1.06, 0.95, 2},
            {2.5, 1, 1}
          }
        },
        hat = {
          rotate = {
            {0, 0, 2},
            {0.2, 8, 2},
            {0.42, -8, 2},
            {0.7, 0, 2},
            {2.12, 8, 2},
            {2.5, 0}
          }
        },
        armF = {
          rotate = {
            {0, -60, 2},
            {0.2, -200, 3},
            {0.42, -112, 2},
            {1.1, -116, 2},
            {1.7, -112, 2},
            {1.85, -104, 2},
            {2.12, -175, 2},
            {2.5, -120}
          }
        },
        foreF = {
          rotate = {
            {0, 0, 2},
            {0.2, -10, 2},
            {0.42, 6, 2},
            {2.12, -6, 2},
            {2.5, 0}
          }
        },
        armB = {
          rotate = {
            {0, -30, 2},
            {0.42, -60, 2},
            {2, -60, 2},
            {2.12, -150, 2},
            {2.5, -40}
          }
        }
      }
    },
    pick = {
      duration = 0.75,
      events = {
        {0.36, "hit"}
      },
      slots = {
        body = {
          {0, "b0"},
          {0.1875, "b1"},
          {0.375, "b2"},
          {0.5625, "b0"}
        }
      },
      bones = {
        float = {
          translate = {
            {0, 0, 0, 2},
            {0.28, 0, 4.5, 2},
            {0.46, 0, 4.5, 2},
            {0.75, 0, 0}
          }
        },
        body = {
          rotate = {
            {0, 0, 2},
            {0.28, 18, 2},
            {0.46, 18, 2},
            {0.75, 0}
          },
          scale = {
            {0, 1, 1, 2},
            {0.2, 0.94, 1.08, 2},
            {0.36, 1.14, 0.86, 2},
            {0.5, 1.1, 0.9, 2},
            {0.75, 1, 1}
          }
        },
        hat = {
          rotate = {
            {0, 0, 2},
            {0.28, 8, 2},
            {0.5, -4, 2},
            {0.75, 0}
          }
        },
        armF = {
          rotate = {
            {0, 0, 2},
            {0.28, -60, 2},
            {0.46, -45, 2},
            {0.75, 0}
          }
        },
        foreF = {
          rotate = {
            {0, 0, 2},
            {0.28, -20, 2},
            {0.75, 0}
          }
        },
        armB = {
          rotate = {
            {0, -20, 2},
            {0.28, -55, 2},
            {0.75, -20}
          }
        }
      }
    },
    happy = {
      duration = 0.9,
      loop = false,
      slots = {
        body = {
          {0, "b0"},
          {0.15, "b1"},
          {0.3, "b2"},
          {0.45, "b0"},
          {0.6, "b1"},
          {0.75, "b2"}
        }
      },
      bones = {
        root = {
          translate = {
            {0, 0, 0, 4},
            {0.2, 0, -9, 3},
            {0.4, 0, 0},
            {0.5, 0, 0, 4},
            {0.64, 0, -4, 3},
            {0.8, 0, 0}
          }
        },
        body = {
          scale = {
            {0, 1.12, 0.88, 4},
            {0.12, 0.88, 1.14, 2},
            {0.32, 1, 1, 3},
            {0.42, 1.16, 0.84, 4},
            {0.56, 0.94, 1.07, 2},
            {0.72, 1.1, 0.9, 4},
            {0.9, 1, 1}
          }
        },
        hat = {
          rotate = {
            {0, 0, 2},
            {0.2, 12, 2},
            {0.42, -10, 2},
            {0.64, 6, 2},
            {0.9, 0}
          }
        },
        armF = {
          rotate = {
            {0, 0, 2},
            {0.2, 150, 2},
            {0.65, 140, 2},
            {0.9, 24}
          }
        },
        armB = {
          rotate = {
            {0, 0, 2},
            {0.2, -150, 2},
            {0.65, -140, 2},
            {0.9, -26}
          }
        }
      }
    }
  },
  rodTip = 26
}
