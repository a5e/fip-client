var _ = require("lodash");
var Bacon = require("baconjs");

var SongModel = module.exports;

/*
 * Fetch the song currently played
 * Return a Bacon property
 */
SongModel.fetchCurrent = function(url) {
  return Bacon.fromBinder(function(sink) {
    var xhr = new XMLHttpRequest();

    xhr.onreadystatechange = function() {
      if(xhr.readyState == 4) {
        var ok = xhr.status >= 200 && xhr.status < 300;
        sink(ok ? JSON.parse(xhr.responseText) : new Bacon.Error());
        sink(new Bacon.End());
      }
    };

    xhr.open("GET", url);
    xhr.send();

    return function() {
      xhr.abort();
    };
  });
};

SongModel.fetch = function(url, interval) {
  var stream = Bacon.repeat(function(i) {
    return i == 0 ? SongModel.fetchCurrent(url) :
                    Bacon.later(interval, url).flatMap(SongModel.fetchCurrent);
  });

  var p_song = stream.skipDuplicates(function(song1, song2) {
    return song1.startTime >= song2.startTime;
  })
  .map(function(song) {
    return _.extend({}, song, {
      favorite: SongModel.isFavorite(song)
    });
  })
  .toProperty();

  return p_song.scan([], function(songs, song) {
    return [song].concat(songs);
  });
};

SongModel.getFavorites = function() {
  return JSON.parse(localStorage.favorites || "[]");
};

SongModel.setFavorites = function(favorites) {
  localStorage.favorites = JSON.stringify(favorites);
};

SongModel.isFavorite = function(song) {
  return _.contains(SongModel.getFavorites(), song);
};

SongModel.addFavorite = function(song) {
  SongModel.setFavorites(_.union(SongModel.getFavorites(), [song.id]));
};

SongModel.removeFavorite = function(song) {
  SongModel.setFavorites(_.reject(SongModel.getFavorites(), function(id) {
    return id === song.id
  }));
};
