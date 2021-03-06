import test from "tape";
import _ from "lodash";
import Bacon from "baconjs";

import {
  searchOnSpotify,
  getFipSongLists,
  getSpotifyPrint,
  getSyncs,
  getFavoriteSongs,
  setFavoriteSongs,
  updateFavSongs,
  getFavSongsStream,
  mergeFavsAndSongs,
  getState
} from "../../../src/js/controllers/song.js";

test("The Song controller should be able to search a song on spotify and add the ID to the song instance", function(t) {
  const Spotify = {
    search: function(song) {
      const responses = {
        "TWO": {
          id: "2",
          href: "https://open.spotify.com/2"
        },
        "THREE": {
          id: "3",
          href: "https://open.spotify.com/3"
        }
      };

      return Bacon.constant(responses[song.id] || null);
    }
  };

  const songs = [{
    id: "ONE"
  },{
    id: "TWO"
  },{
    id: "THREE"
  }];

  Bacon.zipAsArray(songs.map(_.partial(searchOnSpotify, Spotify)))
    .subscribe(function(ev) {
      t.ok(ev.hasValue());

      t.deepEqual(ev.value(), [{
        id: "ONE",
        spotify: null,
        spotifyId: null
      },{
        id: "TWO",
        spotify: "https://open.spotify.com/2",
        spotifyId: "2"
      },{
        id: "THREE",
        spotify: "https://open.spotify.com/3",
        spotifyId: "3"
      }]);

      t.end();

      return Bacon.noMore;
    });
});

test("The Song controller should be able to get the songs FIP is playing", function(t) {
  const Spotify = {
    search: function(song) {
      const responses = {
        "TWO": {
          id: "2",
          href: "https://open.spotify.com/2"
        },
        "THREE": {
          id: "3",
          href: "https://open.spotify.com/3"
        }
      };

      return Bacon.constant(responses[song.id] || null);
    }
  };

  const Fip = {
    fetchFipRadios: function(url, radios) {
      t.equal(url, "ws://host/api/ws");
      t.deepEqual(radios, ["radio1", "radio2"]);

      return {
        radio1: Bacon.fromArray([{
          type: "song",
          song: {
            id: "ONE"
          }
        },{
          type: "song",
          song: {
            id: "TWO"
          }
        }]),
        radio2: Bacon.fromArray([{
          type: "song",
          song: {
            id: "THREE"
          }
        },{
          type: "other",
          song: {
            id: "FOUR"
          }
        }])
      };
    }
  };

  const wsHost = "ws://host/api/ws";

  const data = getFipSongLists(Fip, Spotify, wsHost, [
    "radio1",
    "radio2"
  ]);

  const p_radio1 = data.radio1
    .fold([], (items, item) => items.concat([item]));

  const p_radio2 = data.radio2
    .fold([], (items, item) => items.concat([item]));

  Bacon.zipAsArray([p_radio1, p_radio2])
    .subscribe(function(ev) {
      t.ok(ev.hasValue());

      const [radio1, radio2] = ev.value();

      t.deepEqual(radio1, [
        [],
        [{
          type: "song",
          song: {
            id: "ONE",
            spotify: null,
            spotifyId: null
          }
        }],
        [{
          type: "song",
          song: {
            id: "TWO",
            spotify: "https://open.spotify.com/2",
            spotifyId: "2"
          }
        },{
          type: "song",
          song: {
            id: "ONE",
            spotify: null,
            spotifyId: null
          }
        }]
      ]);

      t.deepEqual(radio2, [
        [],
        [{
          type: "song",
          song: {
            id: "THREE",
            spotify: "https://open.spotify.com/3",
            spotifyId: "3"
          }
        }],
        [{
          type: "other",
          song: {
            id: "FOUR"
          }
        },{
          type: "song",
          song: {
            id: "THREE",
            spotify: "https://open.spotify.com/3",
            spotifyId: "3"
          }
        }]
      ]);

      t.end();

      return Bacon.noMore;
    });
});

test("The Song controller should be able to get a spotify \"print\" (user, playlist and token data) of the user", function(t) {
  const token = {
    access_token: "access_token",
    refresh_token: "refresh_token",
    expires_in: "expires_in",
    token_type: "type"
  };

  const user = {
    id: "1",
    display_name: "1"
  };

  const playlist = {
    id: "2",
    name: "2"
  };

  const Spotify = {
    getUser: function(_token) {
      t.deepEqual(_token, token);
      return Bacon.constant(user);
    },
    getOrCreatePlaylist: function(_token, userId, name) {
      t.deepEqual(_token, token);
      t.equal(userId, user.id);
      t.equal(name, "fipradio");
      return Bacon.constant(playlist);
    }
  };

  getSpotifyPrint(Spotify, token).subscribe(function(ev) {
    t.ok(ev.hasValue());
    t.deepEqual(ev.value(), {
      user: user,
      playlist: playlist,
      token: token
    });

    t.end();

    return Bacon.noMore;
  });
});

test("The Song controller should be able to get an object for each sync backend (localStorage and Spotify)", function(t) {
  const storageSync = {};
  const spotifySync = {};

  const print = {
    user: {
      id: "1",
      display_name: "1"
    },
    playlist: {
      id: "2",
      name: "2"
    },
    token: {
      access_token: "access_token",
      refresh_token: "refresh_token",
      expires_in: "expires_in",
      token_type: "type"
    }
  };

  const Storage = {
    sync: function(name) {
      t.equal(name, "favorites");
      return storageSync;
    }
  };

  const Spotify = {
    sync: function(token, userId, playlistId) {
      t.deepEqual(token, print.token);
      t.equal(userId, print.user.id);
      t.equal(playlistId, print.playlist.id);
      return spotifySync;
    }
  };

  t.deepEqual(getSyncs(Storage, Spotify, print), [
    storageSync,
    spotifySync
  ]);

  t.deepEqual(getSyncs(Storage, Spotify, null), [storageSync]);

  t.end();
});

test("The Song controller should be able to get favorite songs from several sources", function(t) {
  const sync1 = {
    get: function() {
      return Bacon.constant([{
        id: "ONE",
        spotifyId: "1"
      },{
        id: "TWO",
        spotifyId: "2"
      },{
        id: "THREE",
        spotifyId: null
      }]);
    }
  };

  const sync2 = {
    get: function() {
      return Bacon.constant([{
        id: "1",
        spotifyId: "1"
      },{
        id: "4",
        spotifyId: "4"
      }]);
    }
  };

  getFavoriteSongs([sync1, sync2]).subscribe(function(ev) {
    t.ok(ev.hasValue());
    t.deepEqual(ev.value(), [{
      id: "ONE",
      spotifyId: "1"
    },{
      id: "TWO",
      spotifyId: "2"
    },{
      id: "THREE",
      spotifyId: null
    },{
      id: "4",
      spotifyId: "4"
    }]);

    t.end();

    return Bacon.noMore;
  });
});

test("The Song controller should be able to send favorites to several destinations", function(t) {
  const sync1 = {
    songs: [],
    set: function(songs) {
      sync1.songs = songs;
      return Bacon.constant();
    }
  };

  const sync2 = {
    songs: [],
    set: function(songs) {
      sync2.songs = songs;
      return Bacon.constant();
    }
  };

  const songs = [{
    id: "ONE",
    spotifyId: "1"
  },{
    id: "TWO",
    spotifyId: "2"
  },{
    id: "THREE",
    spotifyId: null
  },{
    id: "4",
    spotifyId: "4"
  }];

  setFavoriteSongs([sync1, sync2], songs).subscribe(function(ev) {
    t.ok(ev.hasValue());

    t.deepEqual(sync1.songs, songs);
    t.deepEqual(sync2.songs, songs);

    t.end();

    return Bacon.noMore;
  });
});

test("The Song controller should be able to update the favorite song list when it receives an event", function(t) {
  const favSongs1 = [{
    id: "1",
    favorite: true
  },{
    id: "2",
    favorite: true
  },{
    id: "3",
    favorite: true
  }];

  const favSongs2 = updateFavSongs(favSongs1, {
    type: "add",
    song: {id: "4"}
  });

  const favSongs3 = updateFavSongs(favSongs2, {
    type: "add",
    song: {id: "4"}
  });

  const favSongs4 = updateFavSongs(favSongs3, {
    type: "remove",
    song: {id: "3"}
  });

  const favSongs5 = updateFavSongs(favSongs4, {
    type: "remove",
    song: {id: "3"}
  });

  t.deepEqual(favSongs2, [{
    id: "1",
    favorite: true
  },{
    id: "2",
    favorite: true
  },{
    id: "3",
    favorite: true
  },{
    id: "4",
    favorite: true
  }]);

  t.deepEqual(favSongs3, [{
    id: "1",
    favorite: true
  },{
    id: "2",
    favorite: true
  },{
    id: "3",
    favorite: true
  },{
    id: "4",
    favorite: true
  }]);

  t.deepEqual(favSongs4, [{
    id: "1",
    favorite: true
  },{
    id: "2",
    favorite: true
  },{
    id: "4",
    favorite: true
  }]);

  t.deepEqual(favSongs5, [{
    id: "1",
    favorite: true
  },{
    id: "2",
    favorite: true
  },{
    id: "4",
    favorite: true
  }]);

  t.end();
});

test("The Song controller should be able to provide a property containing the favorite songs", function(t) {
  const songs1 = [{
    id: "ONE",
    spotifyId: null,
    favorite: true
  },{
    id: "TWO",
    spotifyId: "2",
    favorite: true
  }];

  const songs2 = [{
    id: "2",
    spotifyId: "2",
    favorite: true
  },{
    id: "3",
    spotifyId: "3",
    favorite: true
  }];

  const sync1 = {
    get: function() {
      return Bacon.constant(songs1);
    }
  };

  const sync2 = {
    get: function() {
      return Bacon.constant(songs2);
    }
  };

  const favBus = new Bacon.Bus();

  const s_favSongs = getFavSongsStream([sync1, sync2], favBus);

  s_favSongs
    .fold([], (items, item) => items.concat([item]))
    .subscribe(function(ev) {
      t.ok(ev.hasValue());

      t.deepEqual(ev.value(), [
        [{
          id: "ONE",
          spotifyId: null,
          favorite: true
        },{
          id: "TWO",
          spotifyId: "2",
          favorite: true
        },{
          id: "3",
          spotifyId: "3",
          favorite: true
        }],
        [{
          id: "ONE",
          spotifyId: null,
          favorite: true
        },{
          id: "TWO",
          spotifyId: "2",
          favorite: true
        },{
          id: "3",
          spotifyId: "3",
          favorite: true
        },{
          id: "4",
          spotifyId: "4",
          favorite: true
        }],
        [{
          id: "ONE",
          spotifyId: null,
          favorite: true
        },{
          id: "TWO",
          spotifyId: "2",
          favorite: true
        },{
          id: "3",
          spotifyId: "3",
          favorite: true
        },{
          id: "4",
          spotifyId: "4",
          favorite: true
        }],
        [{
          id: "ONE",
          spotifyId: null,
          favorite: true
        },{
          id: "TWO",
          spotifyId: "2",
          favorite: true
        },{
          id: "4",
          spotifyId: "4",
          favorite: true
        }],
        [{
          id: "ONE",
          spotifyId: null,
          favorite: true
        },{
          id: "TWO",
          spotifyId: "2",
          favorite: true
        },{
          id: "4",
          spotifyId: "4",
          favorite: true
        }],
      ]);

      t.end();

      return Bacon.noMore;
    });

  favBus.push({
    type: "add",
    song: {
      id: "4",
      spotifyId: "4",
      favorite: true
    }
  });

  favBus.push({
    type: "add",
    song: {
      id: "4",
      spotifyId: "4",
      favorite: true
    }
  });

  favBus.push({
    type: "remove",
    song: {
      id: "3",
      spotifyId: "3",
      favorite: true
    }
  });

  favBus.push({
    type: "remove",
    song: {
      id: "3",
      spotifyId: "3",
      favorite: true
    }
  });

  favBus.end();
});

test("The Song controller should fill the data model of the songs being played with a 'favorite' field", function(t) {
  const songs = [{
    type: "song",
    song: {
      id: "1"
    }
  },{
    type: "song",
    song: {
      id: "2"
    }
  },{
    type: "other",
    song: {
      id: "3"
    }
  },{
    type: "song",
    song: {
      id: "4"
    }
  }];

  const favs = [{
    id: "1",
    favorite: true
  },{
    id: "4",
    favorite: true
  }];

  t.deepEqual(mergeFavsAndSongs(songs, favs), [{
    type: "song",
    song: {
      id: "1",
      favorite: true
    }
  },{
    type: "song",
    song: {
      id: "2",
      favorite: false
    }
  },{
    type: "other",
    song: {
      id: "3"
    }
  },{
    type: "song",
    song: {
      id: "4",
      favorite: true
    }
  }]);

  t.end();
});

test("The Song controller should provide a state property", function(t) {
  const token = {
    access_token: "access_token",
    refresh_token: "refresh_token",
    expires_in: "expires_in",
    token_type: "type"
  };

  const location = {
    host: "host"
  };

  const Storage = {
    songs: [{
      id: "ONE",
      spotify: null,
      spotifyId: null,
      favorite: true
    },{
      id: "TWO",
      spotify: "2",
      spotifyId: "2",
      favorite: true
    }],
    sync: function() {
      return {
        get: function() {
          return Bacon.constant(Storage.songs);
        },
        set: function(songs) {
          Storage.songs = songs;
          return Bacon.constant();
        }
      };
    }
  };

  const Spotify = {
    user: {
      id: "42",
      display_name: "FORTY TWO"
    },
    playlist: {
      id: "43",
      name: "FORTY THREE"
    },
    songs: [{
      id: "2",
      spotify: "2",
      spotifyId: "2",
      favorite: true
    },{
      id: "3",
      spotify: "3",
      spotifyId: "3",
      favorite: true
    }],
    search: function(song) {
      const res = {
        "ONE": null,
        "TWO": "2",
        "THREE": "3",
        "FOUR": "4",
        "FIVE": "5"
      };

      return Bacon.constant(!res[song.id] ? null : {
        href: res[song.id],
        id: res[song.id]
      });
    },
    getUser: function(token) {
      return Bacon.constant(token ? Spotify.user : null);
    },
    getOrCreatePlaylist: function(token, userId, name) {
      return Bacon.constant(Spotify.playlist);
    },
    sync: function() {
      return {
        get: function() {
          return Bacon.constant(Spotify.songs);
        },
        set: function(songs) {
          Spotify.songs = songs;
          return Bacon.constant();
        }
      };
    }
  };

  const s_radio1 = new Bacon.Bus();
  const s_radio2 = new Bacon.Bus();

  const radios = ["radio1", "radio2"];
  const Fip = {
    fetchFipRadios: function(url, _radios) {
      t.deepEqual(_radios, radios);

      return {
        radio1: s_radio1,
        radio2: s_radio2
      };
    }
  };

  const favBus = new Bacon.Bus();

  getState(Storage, Spotify, Fip, location, radios, favBus, token)
    .fold([], (items, item) => items.concat([item]))
    .subscribe(function(ev) {
      t.ok(ev.hasValue());

      t.deepEqual(ev.value(), [{
        user: Spotify.user,
        radios: {
          radio1: {
            nowPlaying: {
              type: "loading"
            },
            pastSongs: []
          },
          radio2: {
            nowPlaying: {
              type: "loading"
            },
            pastSongs: []
          }
        },
        favSongs: [{
          id: "ONE",
          spotify: null,
          spotifyId: null,
          favorite: true
        },{
          id: "TWO",
          spotify: "2",
          spotifyId: "2",
          favorite: true
        },{
          id: "3",
          spotify: "3",
          spotifyId: "3",
          favorite: true
        }]
      }, {
        user: Spotify.user,
        radios: {
          radio1: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: false
              }
            },
            pastSongs: []
          },
          radio2: {
            nowPlaying: {
              type: "loading"
            },
            pastSongs: []
          }
        },
        favSongs: [{
          id: "ONE",
          spotify: null,
          spotifyId: null,
          favorite: true
        },{
          id: "TWO",
          spotify: "2",
          spotifyId: "2",
          favorite: true
        },{
          id: "3",
          spotify: "3",
          spotifyId: "3",
          favorite: true
        }]
      }, {
        user: Spotify.user,
        radios: {
          radio1: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: false
              }
            },
            pastSongs: []
          },
          radio2: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: false
              }
            },
            pastSongs: []
          }
        },
        favSongs: [{
          id: "ONE",
          spotify: null,
          spotifyId: null,
          favorite: true
        },{
          id: "TWO",
          spotify: "2",
          spotifyId: "2",
          favorite: true
        },{
          id: "3",
          spotify: "3",
          spotifyId: "3",
          favorite: true
        }]
      }, {
        user: Spotify.user,
        radios: {
          radio1: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: false
              }
            },
            pastSongs: []
          },
          radio2: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: false
              }
            },
            pastSongs: []
          }
        },
        favSongs: [{
          id: "ONE",
          spotify: null,
          spotifyId: null,
          favorite: true
        },{
          id: "3",
          spotify: "3",
          spotifyId: "3",
          favorite: true
        }]
      }, {
        user: Spotify.user,
        radios: {
          radio1: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FIVE",
                spotify: "5",
                spotifyId: "5",
                favorite: false
              }
            },
            pastSongs: [{
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: false
              }
            }]
          },
          radio2: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: false
              }
            },
            pastSongs: []
          }
        },
        favSongs: [{
          id: "ONE",
          spotify: null,
          spotifyId: null,
          favorite: true
        },{
          id: "3",
          spotify: "3",
          spotifyId: "3",
          favorite: true
        }]
      }, {
        user: Spotify.user,
        radios: {
          radio1: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FIVE",
                spotify: "5",
                spotifyId: "5",
                favorite: false
              }
            },
            pastSongs: [{
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: true
              }
            }]
          },
          radio2: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: true
              }
            },
            pastSongs: []
          }
        },
        favSongs: [{
          id: "ONE",
          spotify: null,
          spotifyId: null,
          favorite: true
        },{
          id: "3",
          spotify: "3",
          spotifyId: "3",
          favorite: true
        },{
          id: "FOUR",
          spotify: "4",
          spotifyId: "4",
          favorite: true
        }]
      }]);

      t.deepEqual(Storage.songs, [{
        id: "ONE",
        spotify: null,
        spotifyId: null,
        favorite: true
      },{
        id: "3",
        spotify: "3",
        spotifyId: "3",
        favorite: true
      },{
        id: "FOUR",
        spotify: "4",
        spotifyId: "4",
        favorite: true
      }]);

      t.deepEqual(Spotify.songs, [{
        id: "ONE",
        spotify: null,
        spotifyId: null,
        favorite: true
      },{
        id: "3",
        spotify: "3",
        spotifyId: "3",
        favorite: true
      },{
        id: "FOUR",
        spotify: "4",
        spotifyId: "4",
        favorite: true
      }]);

      t.end();

      return Bacon.noMore;
    });

  s_radio1.push({
    type: "song",
    song: {
      id: "FOUR"
    }
  });

  s_radio2.push({
    type: "song",
    song: {
      id: "FOUR"
    }
  });

  favBus.push({
    type: "remove",
    song: {
      id: "TWO",
      spotify: "2",
      spotifyId: "2",
      favorite: true
    }
  });

  s_radio1.push({
    type: "song",
    song: {
      id: "FIVE"
    }
  });

  favBus.push({
    type: "add",
    song: {
      id: "FOUR",
      spotify: "4",
      spotifyId: "4",
      favorite: false
    }
  });

  s_radio1.end();
  s_radio2.end();
  favBus.end();
});

test("The Song controller should provide a state property (even when if token is given)", function(t) {
  const token = null;

  const location = {
    host: "host"
  };

  const Storage = {
    songs: [{
      id: "ONE",
      spotify: null,
      spotifyId: null,
      favorite: true
    },{
      id: "TWO",
      spotify: "2",
      spotifyId: "2",
      favorite: true
    }],
    sync: function() {
      return {
        get: function() {
          return Bacon.constant(Storage.songs);
        },
        set: function(songs) {
          Storage.songs = songs;
          return Bacon.constant();
        }
      };
    }
  };

  const Spotify = {
    search: function(song) {
      const res = {
        "ONE": null,
        "TWO": "2",
        "THREE": "3",
        "FOUR": "4",
        "FIVE": "5"
      };

      return Bacon.constant(!res[song.id] ? null : {
        href: res[song.id],
        id: res[song.id]
      });
    },
    getUser: function(token) {
      t.fail("getState should not try to get the user");
      return Bacon.once(new Bacon.Error());
    },
    getOrCreatePlaylist: function(token, userId, name) {
      t.fail("getState should not try to get the playlist");
      return Bacon.once(new Bacon.Error());
    },
    sync: function() {
      return {
        get: function() {
          t.fail("getState should not try to use Spotify.sync");
          return Bacon.once(new Bacon.Error());
        },
        set: function(songs) {
          t.fail("getState should not try to use Spotify.sync");
          return Bacon.once(new Bacon.Error());
        }
      };
    }
  };

  const s_radio1 = new Bacon.Bus();
  const s_radio2 = new Bacon.Bus();

  const radios = ["radio1", "radio2"];
  const Fip = {
    fetchFipRadios: function(url, _radios) {
      t.deepEqual(_radios, radios);

      return {
        radio1: s_radio1,
        radio2: s_radio2
      }
    }
  };

  const favBus = new Bacon.Bus();

  getState(Storage, Spotify, Fip, location, radios, favBus, token)
    .fold([], (items, item) => items.concat([item]))
    .subscribe(function(ev) {
      t.ok(ev.hasValue());

      t.deepEqual(ev.value(), [{
        user: null,
        radios: {
          radio1: {
            nowPlaying: {
              type: "loading"
            },
            pastSongs: []
          },
          radio2: {
            nowPlaying: {
              type: "loading"
            },
            pastSongs: []
          }
        },
        favSongs: [{
          id: "ONE",
          spotify: null,
          spotifyId: null,
          favorite: true
        },{
          id: "TWO",
          spotify: "2",
          spotifyId: "2",
          favorite: true
        }]
      }, {
        user: null,
        radios: {
          radio1: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: false
              }
            },
            pastSongs: []
          },
          radio2: {
            nowPlaying: {
              type: "loading"
            },
            pastSongs: []
          }
        },
        favSongs: [{
          id: "ONE",
          spotify: null,
          spotifyId: null,
          favorite: true
        },{
          id: "TWO",
          spotify: "2",
          spotifyId: "2",
          favorite: true
        }]
      }, {
        user: null,
        radios: {
          radio1: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: false
              }
            },
            pastSongs: []
          },
          radio2: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: false
              }
            },
            pastSongs: []
          }
        },
        favSongs: [{
          id: "ONE",
          spotify: null,
          spotifyId: null,
          favorite: true
        },{
          id: "TWO",
          spotify: "2",
          spotifyId: "2",
          favorite: true
        }]
      }, {
        user: null,
        radios: {
          radio1: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: false
              }
            },
            pastSongs: []
          },
          radio2: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: false
              }
            },
            pastSongs: []
          }
        },
        favSongs: [{
          id: "ONE",
          spotify: null,
          spotifyId: null,
          favorite: true
        }]
      }, {
        user: null,
        radios: {
          radio1: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FIVE",
                spotify: "5",
                spotifyId: "5",
                favorite: false
              }
            },
            pastSongs: [{
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: false
              }
            }]
          },
          radio2: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: false
              }
            },
            pastSongs: []
          }
        },
        favSongs: [{
          id: "ONE",
          spotify: null,
          spotifyId: null,
          favorite: true
        }]
      }, {
        user: null,
        radios: {
          radio1: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FIVE",
                spotify: "5",
                spotifyId: "5",
                favorite: false
              }
            },
            pastSongs: [{
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: true
              }
            }]
          },
          radio2: {
            nowPlaying: {
              type: "song",
              song: {
                id: "FOUR",
                spotify: "4",
                spotifyId: "4",
                favorite: true
              }
            },
            pastSongs: []
          }
        },
        favSongs: [{
          id: "ONE",
          spotify: null,
          spotifyId: null,
          favorite: true
        },{
          id: "FOUR",
          spotify: "4",
          spotifyId: "4",
          favorite: true
        }]
      }]);

      t.deepEqual(Storage.songs, [{
        id: "ONE",
        spotify: null,
        spotifyId: null,
        favorite: true
      },{
        id: "FOUR",
        spotify: "4",
        spotifyId: "4",
        favorite: true
      }]);

      t.end();

      return Bacon.noMore;
    });

  s_radio1.push({
    type: "song",
    song: {
      id: "FOUR"
    }
  });

  s_radio2.push({
    type: "song",
    song: {
      id: "FOUR"
    }
  });

  favBus.push({
    type: "remove",
    song: {
      id: "TWO",
      spotify: "2",
      spotifyId: "2",
      favorite: true
    }
  });

  s_radio1.push({
    type: "song",
    song: {
      id: "FIVE"
    }
  });

  favBus.push({
    type: "add",
    song: {
      id: "FOUR",
      spotify: "4",
      spotifyId: "4",
      favorite: false
    }
  });

  s_radio1.end();
  s_radio2.end();
  favBus.end();
});
