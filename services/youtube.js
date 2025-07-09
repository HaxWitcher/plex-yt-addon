const ytdl = require('ytdl-core');
class YouTubeService {
  async getInfo(videoUrl) {
    return await ytdl.getInfo(videoUrl);
  }
  chooseBestFormat(formats) {
    const mp4s = formats.filter(f =>
      f.hasVideo && f.hasAudio && f.container === 'mp4'
    );
    mp4s.sort((a, b) => (b.height || 0) - (a.height || 0));
    return mp4s[0] || formats.find(f => f.hasVideo && f.hasAudio);
  }
  async getDirectStream(videoId) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await this.getInfo(url);
    const fmt  = this.chooseBestFormat(info.formats);
    if (!fmt) throw new Error('Nema formata za streaming');
    return { url: fmt.url, title: info.videoDetails.title };
  }
}
module.exports = { YouTubeService };
