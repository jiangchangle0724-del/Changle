/** 直连用的 STUN：Cloudflare 的，免费免账号。同一个 Wi-Fi 下其实用不到它，跨网段时帮忙找路。 */
export const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];
